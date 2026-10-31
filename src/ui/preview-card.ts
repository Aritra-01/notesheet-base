/**
 * UI Component: Interactive Preview Card with Live Render, Stats, and Pipeline Badge
 */

import { usesRasterPipeline } from '../core/engine/processor';
import { renderPreviewSheet } from '../core/preview/preview-renderer';
import { store } from './state';

export function initPreviewCard(elements: {
  previewCanvas: HTMLCanvasElement;
  emptyState: HTMLElement;
  statsEl: HTMLElement;
  pipelineBadge: HTMLElement;
  processBtn: HTMLButtonElement;
  onProcess: () => void;
}): void {
  const { previewCanvas, emptyState, statsEl, pipelineBadge, processBtn, onProcess } = elements;

  processBtn.addEventListener('click', onProcess);

  let debounceTimer: any = null;
  let renderSeq = 0;

  function schedulePreviewRender() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(drawPreview, 160);
  }

  async function drawPreview() {
    const seq = ++renderSeq;
    const { pdfDoc, selectedPages, settings } = store.getState();
    const sortedPages = [...selectedPages].sort((a, b) => a - b);

    if (!pdfDoc || sortedPages.length === 0) {
      previewCanvas.hidden = true;
      emptyState.hidden = false;
      emptyState.textContent = pdfDoc
        ? 'No pages selected. Tap thumbnails to select slides.'
        : 'Add one or more PDFs to see a live preview sheet.';
      return;
    }

    try {
      const scratch = document.createElement('canvas');
      const result = await renderPreviewSheet(pdfDoc, sortedPages, settings, scratch, 820);
      if (seq !== renderSeq || !result) return;

      previewCanvas.width = scratch.width;
      previewCanvas.height = scratch.height;
      const ctx = previewCanvas.getContext('2d');
      ctx?.drawImage(scratch, 0, 0);

      previewCanvas.hidden = false;
      emptyState.hidden = true;
      scratch.width = scratch.height = 0;
    } catch (err) {
      if (seq === renderSeq) {
        console.warn('Preview rendering error:', err);
      }
    }
  }

  store.subscribe((state) => {
    const { pdfDoc, totalPageCount, selectedPages, settings, isProcessing } = state;
    const selectedCount = selectedPages.size;
    const perSheet = settings.rows * settings.cols;
    const sheetsNeeded = settings.booklet
      ? Math.ceil(selectedCount / 4)
      : Math.ceil(selectedCount / perSheet);

    // Update Process Button status
    processBtn.disabled = !pdfDoc || selectedCount === 0 || isProcessing;

    // Pipeline badge
    const isRaster = usesRasterPipeline(settings);
    pipelineBadge.textContent = isRaster ? 'Raster Mode' : 'Vector Mode';
    pipelineBadge.className = `pipeline-badge ${isRaster ? 'badge-raster' : 'badge-vector'}`;
    pipelineBadge.title = isRaster
      ? 'High-precision pixel processing mode (preserves screenshots, removes cream tint, grayscale/B&W)'
      : 'Ultra-fast lossless vector mode (preserves crystal clear vector text & tiny file size)';

    // Stats calculations
    if (pdfDoc && selectedCount > 0) {
      const savedSheets = selectedCount - sheetsNeeded;
      let statsText = `<strong>${selectedCount}</strong> ${
        selectedCount === 1 ? 'slide' : 'slides'
      } → <strong>${sheetsNeeded}</strong> ${sheetsNeeded === 1 ? 'sheet' : 'sheets'}`;

      if (perSheet > 1) {
        statsText += ` (${perSheet}/page)`;
      }

      if (savedSheets > 0) {
        statsText += ` · <span class="badge-saved">Saves ${savedSheets} ${
          savedSheets === 1 ? 'sheet' : 'sheets'
        }</span>`;
      }
      statsEl.innerHTML = statsText;
    } else {
      statsEl.innerHTML = '';
    }

    // Schedule live canvas update
    schedulePreviewRender();
  });
}
