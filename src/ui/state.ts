/**
 * Central Reactive State Store for NoteSheet Base.
 */

import * as pdfjsLib from 'pdfjs-dist';
import { DEFAULT_SETTINGS, STORAGE_KEY } from '../core/config';
import { getPdfPageCount, mergePdfFiles } from '../core/engine/pdf-merger';
import { openPdfForRender } from '../core/engine/pdfjs-wrapper';
import { FileEntry, ProcessingProgress, ProcessResult, Settings } from '../core/types';

export type StateListener = (state: AppState) => void;

export interface AppState {
  files: FileEntry[];
  mergedBytes: Uint8Array | null;
  pdfDoc: pdfjsLib.PDFDocumentProxy | null;
  totalPageCount: number;
  selectedPages: Set<number>;
  settings: Settings;
  isProcessing: boolean;
  progress: ProcessingProgress | null;
  result: ProcessResult | null;
  error: string | null;
  busyMessage: string | null;
  theme: 'light' | 'dark' | 'auto';
}

class AppStore {
  private state: AppState;
  private listeners: Set<StateListener> = new Set();
  private loadSequence = 0;

  constructor() {
    this.state = {
      files: [],
      mergedBytes: null,
      pdfDoc: null,
      totalPageCount: 0,
      selectedPages: new Set(),
      settings: this.loadPersistedSettings(),
      isProcessing: false,
      progress: null,
      result: null,
      error: null,
      busyMessage: null,
      theme: (localStorage.getItem('notesheet:theme') as any) || 'auto',
    };
  }

  public getState(): AppState {
    return this.state;
  }

  public subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (err) {
        console.error('State subscriber error:', err);
      }
    }
  }

  private loadPersistedSettings(): Settings {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Could not load persisted settings:', e);
    }
    return { ...DEFAULT_SETTINGS };
  }

  public saveSettings(partial: Partial<Settings>): void {
    this.state.settings = { ...this.state.settings, ...partial };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state.settings));
    } catch (e) {
      /* ignore */
    }
    this.clearResult();
    this.notify();
  }

  public setTheme(theme: 'light' | 'dark' | 'auto'): void {
    this.state.theme = theme;
    localStorage.setItem('notesheet:theme', theme);
    this.applyTheme(theme);
    this.notify();
  }

  public applyTheme(theme: 'light' | 'dark' | 'auto'): void {
    const root = document.documentElement;
    if (theme === 'auto') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', theme);
    }
  }

  public async addFiles(newFiles: File[]): Promise<void> {
    const pdfs = newFiles.filter(
      (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name)
    );

    if (pdfs.length === 0) {
      this.setError('Please select valid PDF files.');
      return;
    }

    let nextId = this.state.files.length ? Math.max(...this.state.files.map((f) => f.id)) + 1 : 1;
    for (const f of pdfs) {
      this.state.files.push({
        id: nextId++,
        file: f,
        name: f.name,
        size: f.size,
        pageCount: undefined,
      });
    }

    this.clearError();
    await this.rebuildDocument();
  }

  public async removeFile(index: number): Promise<void> {
    if (index >= 0 && index < this.state.files.length) {
      this.state.files.splice(index, 1);
      await this.rebuildDocument();
    }
  }

  public async moveFile(fromIndex: number, toIndex: number): Promise<void> {
    if (
      fromIndex < 0 ||
      fromIndex >= this.state.files.length ||
      toIndex < 0 ||
      toIndex >= this.state.files.length
    ) {
      return;
    }
    const [moved] = this.state.files.splice(fromIndex, 1);
    this.state.files.splice(toIndex, 0, moved);
    await this.rebuildDocument();
  }

  public togglePage(pageNum: number): void {
    if (this.state.selectedPages.has(pageNum)) {
      this.state.selectedPages.delete(pageNum);
    } else {
      this.state.selectedPages.add(pageNum);
    }
    this.clearResult();
    this.notify();
  }

  public selectAllPages(): void {
    this.state.selectedPages = new Set(
      Array.from({ length: this.state.totalPageCount }, (_, i) => i + 1)
    );
    this.clearResult();
    this.notify();
  }

  public selectNoPages(): void {
    this.state.selectedPages.clear();
    this.clearResult();
    this.notify();
  }

  public flipSelection(): void {
    const all = Array.from({ length: this.state.totalPageCount }, (_, i) => i + 1);
    this.state.selectedPages = new Set(all.filter((p) => !this.state.selectedPages.has(p)));
    this.clearResult();
    this.notify();
  }

  public removePageRanges(rangeString: string): void {
    try {
      this.clearError();
      const removeSet = new Set<number>();
      const parts = rangeString.split(/[,\s]+/).filter(Boolean);

      for (const part of parts) {
        const match = part.match(/^(\d+)(?:-(\d+))?$/);
        if (!match) {
          throw new Error(`Invalid page range token: "${part}"`);
        }
        let start = parseInt(match[1], 10);
        let end = match[2] ? parseInt(match[2], 10) : start;
        if (start > end) [start, end] = [end, start];

        for (let p = Math.max(1, start); p <= Math.min(this.state.totalPageCount, end); p++) {
          removeSet.add(p);
        }
      }

      removeSet.forEach((p) => this.state.selectedPages.delete(p));
      this.clearResult();
      this.notify();
    } catch (err: any) {
      this.setError(err.message || String(err));
    }
  }

  public setProcessing(isProcessing: boolean, progress: ProcessingProgress | null = null): void {
    this.state.isProcessing = isProcessing;
    this.state.progress = progress;
    this.notify();
  }

  public setResult(result: ProcessResult): void {
    this.state.result = result;
    this.notify();
  }

  public clearResult(): void {
    if (this.state.result?.blobUrl) {
      URL.revokeObjectURL(this.state.result.blobUrl);
    }
    this.state.result = null;
    this.notify();
  }

  public setError(message: string | null): void {
    this.state.error = message;
    this.notify();
  }

  public clearError(): void {
    this.state.error = null;
    this.notify();
  }

  private async rebuildDocument(): Promise<void> {
    const seq = ++this.loadSequence;
    this.clearResult();
    this.clearError();

    if (this.state.pdfDoc) {
      (this.state.pdfDoc as any).destroy?.() ?? this.state.pdfDoc.cleanup?.();
      this.state.pdfDoc = null;
    }

    if (this.state.files.length === 0) {
      this.state.mergedBytes = null;
      this.state.totalPageCount = 0;
      this.state.selectedPages.clear();
      this.state.busyMessage = null;
      this.notify();
      return;
    }

    try {
      this.state.busyMessage =
        this.state.files.length > 1 ? 'Merging PDFs…' : 'Loading PDF…';
      this.notify();

      // Inspect individual page counts
      for (const entry of this.state.files) {
        if (entry.pageCount === undefined) {
          entry.pageCount = await getPdfPageCount(entry.file);
        }
      }

      const mergedBytes = await mergePdfFiles(
        this.state.files.map((f) => f.file),
        (prog) => {
          this.state.busyMessage = prog.message;
          this.notify();
        }
      );

      if (seq !== this.loadSequence) return;

      const pdfDoc = await openPdfForRender(mergedBytes);
      if (seq !== this.loadSequence) {
        (pdfDoc as any).destroy?.() ?? pdfDoc.cleanup?.();
        return;
      }

      this.state.mergedBytes = mergedBytes;
      this.state.pdfDoc = pdfDoc;
      this.state.totalPageCount = pdfDoc.numPages;
      this.state.selectedPages = new Set(
        Array.from({ length: pdfDoc.numPages }, (_, i) => i + 1)
      );
      this.state.busyMessage = null;
      this.notify();
    } catch (err: any) {
      console.error('Failed to rebuild document:', err);
      this.state.busyMessage = null;
      this.setError(`Failed to read PDF: ${err.message || err}`);
    }
  }
}

export const store = new AppStore();
