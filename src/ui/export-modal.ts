/**
 * UI Component: Processing Progress & Result Export Card
 */

import { formatBytes } from './file-list';
import { getIcon } from './icons';
import { store } from './state';

export function initExportModal(elements: {
  progressContainer: HTMLElement;
  progressBar: HTMLElement;
  progressText: HTMLElement;
  cancelBtn: HTMLButtonElement;
  resultContainer: HTMLElement;
  downloadLink: HTMLAnchorElement;
  shareBtn: HTMLButtonElement;
  resultMeta: HTMLElement;
  onCancel: () => void;
}): void {
  const {
    progressContainer,
    progressBar,
    progressText,
    cancelBtn,
    resultContainer,
    downloadLink,
    shareBtn,
    resultMeta,
    onCancel,
  } = elements;

  cancelBtn.addEventListener('click', onCancel);

  // Share action using Web Share API
  shareBtn.addEventListener('click', async () => {
    const result = store.getState().result;
    if (!result || !result.blobUrl) return;

    try {
      const blob = new Blob([result.bytes as unknown as BlobPart], { type: 'application/pdf' });
      const file = new File([blob], downloadLink.download || 'notesheet.pdf', {
        type: 'application/pdf',
      });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: file.name,
          text: 'Here are your print-ready converted lecture notes!',
        });
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        store.setError(`Failed to share: ${err.message || err}`);
      }
    }
  });

  store.subscribe((state) => {
    const { isProcessing, progress, result } = state;

    // Processing progress
    if (isProcessing && progress) {
      progressContainer.hidden = false;
      progressBar.style.width = `${Math.round(progress.fraction * 100)}%`;
      progressText.textContent = progress.message;
    } else {
      progressContainer.hidden = true;
    }

    // Finished result
    if (result && result.blobUrl) {
      resultContainer.hidden = false;
      downloadLink.href = result.blobUrl;

      // Generate smart output filename
      const firstFile = state.files[0];
      const baseName =
        state.files.length === 1
          ? firstFile.name.replace(/\.pdf$/i, '')
          : `merged_${state.files.length}_files`;
      const fileName = `${baseName}_printready.pdf`;

      downloadLink.download = fileName;
      downloadLink.innerHTML = `${getIcon('download')} <span>Download PDF (${formatBytes(
        result.size
      )})</span>`;

      // Check if Web Share API with files is supported
      const canShare =
        typeof navigator !== 'undefined' &&
        'canShare' in navigator &&
        typeof navigator.share === 'function';
      shareBtn.hidden = !canShare;

      resultMeta.textContent = `${result.pages} slides on ${result.sheets} sheets · ${
        result.pipeline === 'vector' ? 'Vector' : 'Raster'
      } mode · ${result.durationSecs}s`;
    } else {
      resultContainer.hidden = true;
    }
  });
}
