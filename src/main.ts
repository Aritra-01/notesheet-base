/**
 * Application Entry Point: initializes UI components, connects stores and controllers.
 */

import { processPdf } from './core/engine/processor';
import { initControls } from './ui/controls';
import { initExportModal } from './ui/export-modal';
import { initFileList } from './ui/file-list';
import { initPageGrid } from './ui/page-grid';
import { initPreviewCard } from './ui/preview-card';
import { store } from './ui/state';

document.addEventListener('DOMContentLoaded', () => {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

  // Theme Controller
  const themeBtn = $('theme-btn');
  themeBtn.addEventListener('click', () => {
    const cur = store.getState().theme;
    const next = cur === 'dark' ? 'light' : 'dark';
    store.setTheme(next);
  });
  store.applyTheme(store.getState().theme);

  // File Upload Dropzone
  const dropzone = $('dropzone');
  const fileInput = $<HTMLInputElement>('file-input');

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer?.types.includes('Files')) {
      dropzone.classList.add('drag-active');
    }
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('drag-active');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('drag-active');
    if (e.dataTransfer?.files?.length) {
      store.addFiles(Array.from(e.dataTransfer.files));
    }
  });

  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files?.length) {
      store.addFiles(Array.from(fileInput.files));
      fileInput.value = '';
    }
  });

  // Initialize UI Subsystems
  initFileList($('file-list'));

  initPageGrid(
    $('page-grid'),
    $('page-summary'),
    $<HTMLInputElement>('remove-input'),
    $('remove-apply'),
    {
      all: $('btn-sel-all'),
      none: $('btn-sel-none'),
      flip: $('btn-sel-flip'),
    }
  );

  initControls({
    presetsContainer: $('presets-grid'),
    customGridContainer: $('custom-grid'),
    rowsInput: $<HTMLInputElement>('opt-rows'),
    colsInput: $<HTMLInputElement>('opt-cols'),
    paperSelect: $<HTMLSelectElement>('opt-paper'),
    orientSelect: $<HTMLSelectElement>('opt-orient'),
    marginInput: $<HTMLInputElement>('opt-margin'),
    gapInput: $<HTMLInputElement>('opt-gap'),
    qualitySelect: $<HTMLSelectElement>('opt-quality'),
    invertSwitch: $<HTMLInputElement>('opt-invert'),
    whiteSwitch: $<HTMLInputElement>('opt-white'),
    preserveSwitch: $<HTMLInputElement>('opt-preserve'),
    clearSwitch: $<HTMLInputElement>('opt-clear'),
    graySwitch: $<HTMLInputElement>('opt-gray'),
    bwSwitch: $<HTMLInputElement>('opt-bw'),
    sepSwitch: $<HTMLInputElement>('opt-sep'),
    numSwitch: $<HTMLInputElement>('opt-num'),
    numStartInput: $<HTMLInputElement>('opt-num-start'),
  });

  let currentAbortController: AbortController | null = null;

  // Process PDF Trigger Handler
  const handleProcessPdf = async () => {
    const { mergedBytes, selectedPages, settings } = store.getState();
    const sortedPages = [...selectedPages].sort((a, b) => a - b);

    if (!mergedBytes || sortedPages.length === 0) return;

    store.clearError();
    const abort = new AbortController();
    currentAbortController = abort;
    store.setProcessing(true, { fraction: 0, message: 'Starting PDF engine…' });

    try {
      const result = await processPdf(
        mergedBytes,
        sortedPages,
        settings,
        (progress) => {
          store.setProcessing(true, progress);
        },
        abort.signal
      );

      store.setResult(result);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Processing failed:', err);
        store.setError(`Processing error: ${err.message || err}`);
      }
    } finally {
      currentAbortController = null;
      store.setProcessing(false, null);
    }
  };

  initPreviewCard({
    previewCanvas: $<HTMLCanvasElement>('preview-canvas'),
    emptyState: $('preview-empty'),
    statsEl: $('stats-summary'),
    pipelineBadge: $('pipeline-badge'),
    processBtn: $<HTMLButtonElement>('process-btn'),
    onProcess: handleProcessPdf,
  });

  initExportModal({
    progressContainer: $('progress-box'),
    progressBar: $('progress-bar'),
    progressText: $('progress-text'),
    cancelBtn: $<HTMLButtonElement>('cancel-btn'),
    resultContainer: $('result-box'),
    downloadLink: $<HTMLAnchorElement>('download-link'),
    shareBtn: $<HTMLButtonElement>('share-btn'),
    resultMeta: $('result-meta'),
    onCancel: () => {
      currentAbortController?.abort();
    },
  });

  // Global State Subscriptions for Layout and Alerts
  const panelPages = $('panel-pages');
  const errorAlert = $('error-alert');
  const busyAlert = $('busy-alert');

  store.subscribe((state) => {
    // Show/hide page thumbnails card
    panelPages.hidden = state.totalPageCount === 0;

    // Error alert
    if (state.error) {
      errorAlert.textContent = state.error;
      errorAlert.hidden = false;
    } else {
      errorAlert.hidden = true;
    }

    // Busy message
    if (state.busyMessage) {
      busyAlert.textContent = state.busyMessage;
      busyAlert.hidden = false;
    } else {
      busyAlert.hidden = true;
    }
  });
});
