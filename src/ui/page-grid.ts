/**
 * UI Component: Visual Page Thumbnails Grid with Lazy Rendering & Range Selection
 */

import { renderPdfPage } from '../core/engine/pdfjs-wrapper';
import { getIcon } from './icons';
import { store } from './state';

export function initPageGrid(
  container: HTMLElement,
  summaryEl: HTMLElement,
  rangeInput: HTMLInputElement,
  applyRemoveBtn: HTMLElement,
  selectBtns: { all: HTMLElement; none: HTMLElement; flip: HTMLElement }
): void {
  let thumbObserver: IntersectionObserver | null = null;
  let currentDoc: any = null;

  function renderThumb(buttonEl: HTMLElement, pageNum: number, doc: any) {
    if (doc !== store.getState().pdfDoc) return;
    doc
      .getPage(pageNum)
      .then(async (page: any) => {
        const vp1 = page.getViewport({ scale: 1 });
        const scale = 240 / Math.max(vp1.width, vp1.height);
        const { canvas } = await renderPdfPage(doc, pageNum, scale);
        canvas.className = 'thumb-canvas';
        buttonEl.prepend(canvas);
      })
      .catch((err: any) => {
        console.warn(`Could not render thumbnail for page ${pageNum}:`, err);
      });
  }

  // Selection actions
  selectBtns.all.addEventListener('click', () => store.selectAllPages());
  selectBtns.none.addEventListener('click', () => store.selectNoPages());
  selectBtns.flip.addEventListener('click', () => store.flipSelection());

  const executeRemoveRange = () => {
    const val = rangeInput.value.trim();
    if (val) {
      store.removePageRanges(val);
      rangeInput.value = '';
    }
  };

  applyRemoveBtn.addEventListener('click', executeRemoveRange);
  rangeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      executeRemoveRange();
    }
  });

  store.subscribe((state) => {
    const { pdfDoc, totalPageCount, selectedPages } = state;

    // Update summary text
    if (totalPageCount > 0) {
      summaryEl.textContent = `${selectedPages.size} of ${totalPageCount} selected`;
    } else {
      summaryEl.textContent = '';
    }

    // Rebuild grid elements if PDF document changed
    if (pdfDoc !== currentDoc) {
      currentDoc = pdfDoc;
      container.innerHTML = '';
      if (thumbObserver) {
        thumbObserver.disconnect();
      }

      if (!pdfDoc || totalPageCount === 0) return;

      thumbObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const target = entry.target as HTMLElement;
            thumbObserver?.unobserve(target);
            const pageNum = parseInt(target.dataset.page || '0', 10);
            if (pageNum > 0) {
              renderThumb(target, pageNum, pdfDoc);
            }
          });
        },
        { root: container, rootMargin: '250px' }
      );

      for (let n = 1; n <= totalPageCount; n++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'thumb-item';
        btn.dataset.page = String(n);
        btn.setAttribute('aria-label', `Page ${n}`);

        btn.innerHTML = `
          <div class="thumb-badge">${n}</div>
          <div class="thumb-check">${getIcon('check')}</div>
        `;

        btn.addEventListener('click', () => store.togglePage(n));
        container.appendChild(btn);
        thumbObserver.observe(btn);
      }
    }

    // Refresh state classes (included vs excluded)
    container.querySelectorAll('.thumb-item').forEach((item) => {
      const pageNum = parseInt((item as HTMLElement).dataset.page || '0', 10);
      const isSelected = selectedPages.has(pageNum);
      item.classList.toggle('off', !isSelected);
      const checkEl = item.querySelector('.thumb-check');
      if (checkEl) {
        checkEl.innerHTML = getIcon(isSelected ? 'check' : 'x');
      }
    });
  });
}
