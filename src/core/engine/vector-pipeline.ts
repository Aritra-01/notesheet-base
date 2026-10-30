/**
 * High-Speed Vector PDF Pipeline.
 * Keeps embedded vector fonts and vector paths intact; inverts colors using PDF BlendModes.
 */

import { BlendMode, degrees, PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { detectBackground, whitePointStrength } from '../filters/pixel-filters';
import { ProcessingProgress, Settings } from '../types';
import { calculateSheetGrid, calculateSheetSize, fitInCell, gapMmToPt, marginMmToPt } from './layout-math';
import { openPdfForRender, renderPdfPage } from './pdfjs-wrapper';

/**
 * Rapidly measures dominant background colors per page using tiny renders.
 */
async function measurePageBackgrounds(
  bytes: Uint8Array,
  pageNumbers: number[],
  onProgress?: (progress: ProcessingProgress) => void,
  signal?: AbortSignal
): Promise<Map<number, [number, number, number] | null>> {
  if (typeof document === 'undefined') {
    return new Map();
  }
  const pdfDoc = await openPdfForRender(bytes);
  const canvas = document.createElement('canvas');
  const results = new Map<number, [number, number, number] | null>();

  try {
    for (let i = 0; i < pageNumbers.length; i++) {
      if (signal?.aborted) throw new DOMException('Processing cancelled', 'AbortError');
      const pageNum = pageNumbers[i];
      const page = await pdfDoc.getPage(pageNum);
      const vp1 = page.getViewport({ scale: 1 });
      const scale = 160 / Math.max(vp1.width, vp1.height);

      const { ctx } = await renderPdfPage(pdfDoc, pageNum, scale, canvas);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const bg = detectBackground(imgData.width, imgData.height, imgData.data);
      results.set(pageNum, bg);

      if (i % 10 === 0) {
        onProgress?.({
          fraction: 0.05 + (0.2 * (i + 1)) / pageNumbers.length,
          message: `Analyzing slide background (${i + 1}/${pageNumbers.length})`,
          stage: 'measuring',
        });
      }
    }
  } finally {
    canvas.width = canvas.height = 0;
    (pdfDoc as any).destroy?.() ?? pdfDoc.cleanup?.();
  }

  return results;
}

export async function processVector(
  bytes: Uint8Array,
  pageNumbers: number[],
  settings: Settings,
  onProgress?: (progress: ProcessingProgress) => void,
  signal?: AbortSignal
): Promise<{ bytes: Uint8Array; sheets: number }> {
  const backgrounds =
    settings.invert && settings.whiteBackground
      ? await measurePageBackgrounds(bytes, pageNumbers, onProgress, signal)
      : null;

  const srcDoc = await PDFDocument.load(bytes, {
    ignoreEncryption: true,
    updateMetadata: false,
  });

  // Apply vector blend-mode inversion
  if (settings.invert) {
    pageNumbers.forEach((pageNum, i) => {
      if (signal?.aborted) throw new DOMException('Processing cancelled', 'AbortError');
      const page = srcDoc.getPage(pageNum - 1);
      const box = page.getMediaBox();
      const rect = { x: box.x, y: box.y, width: box.width, height: box.height, opacity: 1 };

      // Invert all colors using Difference blend mode with pure white
      page.drawRectangle({
        ...rect,
        color: rgb(1, 1, 1),
        blendMode: BlendMode.Difference,
      });

      // Color Dodge overlay to map navy/slate/dark green to pure #FFFFFF
      const bg = backgrounds?.get(pageNum);
      if (bg) {
        const [dr, dg, db] = whitePointStrength(bg);
        page.drawRectangle({
          ...rect,
          color: rgb(dr, dg, db),
          blendMode: BlendMode.ColorDodge,
        });
      }

      if (i % 15 === 0) {
        onProgress?.({
          fraction: 0.25 + (0.1 * (i + 1)) / pageNumbers.length,
          message: `Inverting vector slides (${i + 1}/${pageNumbers.length})`,
          stage: 'rendering',
        });
      }
    });
  }

  const perSheet = settings.rows * settings.cols;

  // Single page original size shortcut
  if (perSheet === 1 && settings.paper === 'original') {
    const keep = new Set(pageNumbers);
    for (let i = srcDoc.getPageCount() - 1; i >= 0; i--) {
      if (!keep.has(i + 1)) {
        srcDoc.removePage(i);
      }
    }
    if (settings.pageNumbers) {
      await drawVectorPageNumbers(srcDoc, settings.pageNumberStart);
    }
    onProgress?.({ fraction: 0.95, message: 'Saving PDF file…', stage: 'saving' });
    return { bytes: await srcDoc.save(), sheets: srcDoc.getPageCount() };
  }

  // Multi-up sheet arrangement
  const outDoc = await PDFDocument.create();
  const srcPages = pageNumbers.map((n) => srcDoc.getPage(n - 1));

  onProgress?.({ fraction: 0.38, message: 'Embedding vector pages…', stage: 'arranging' });

  const embedded = await outDoc.embedPages(
    srcPages,
    srcPages.map((p) => {
      const b = p.getCropBox();
      return { left: b.x, bottom: b.y, right: b.x + b.width, top: b.y + b.height };
    })
  );

  const displayed = srcPages.map((p) => {
    const rot = ((p.getRotation().angle % 360) + 360) % 360;
    const b = p.getCropBox();
    return rot % 180 ? { w: b.height, h: b.width, rot } : { w: b.width, h: b.height, rot };
  });

  const [sheetW, sheetH] = calculateSheetSize(settings, displayed[0].w, displayed[0].h);
  const { cells, lines } = calculateSheetGrid(
    sheetW,
    sheetH,
    settings.rows,
    settings.cols,
    marginMmToPt(settings.marginMm),
    gapMmToPt(settings.gapMm)
  );

  const sheets = Math.ceil(embedded.length / perSheet);

  for (let s = 0; s < sheets; s++) {
    if (signal?.aborted) throw new DOMException('Processing cancelled', 'AbortError');
    const page = outDoc.addPage([sheetW, sheetH]);

    for (let k = 0; k < perSheet; k++) {
      const idx = s * perSheet + k;
      if (idx >= embedded.length) break;

      const { w, h, rot } = displayed[idx];
      const fit = fitInCell(cells[k], w, h);

      const ew = embedded[idx].width * fit.scale;
      const eh = embedded[idx].height * fit.scale;
      let x = fit.x;
      let y = fit.y;
      let angle = 0;

      if (rot === 90) {
        y = fit.y + fit.h;
        angle = -90;
      } else if (rot === 180) {
        x = fit.x + fit.w;
        y = fit.y + fit.h;
        angle = 180;
      } else if (rot === 270) {
        x = fit.x + fit.w;
        angle = 90;
      }

      page.drawPage(embedded[idx], {
        x,
        y,
        width: ew,
        height: eh,
        rotate: degrees(angle),
      });
    }

    if (settings.separators) {
      drawVectorSeparators(page, lines);
    }

    onProgress?.({
      fraction: 0.4 + (0.5 * (s + 1)) / sheets,
      message: `Arranging sheet ${s + 1} of ${sheets}`,
      stage: 'arranging',
    });

    if (s % 8 === 0) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  if (settings.pageNumbers) {
    await drawVectorPageNumbers(outDoc, settings.pageNumberStart);
  }

  onProgress?.({ fraction: 0.96, message: 'Saving vector PDF…', stage: 'saving' });
  return { bytes: await outDoc.save(), sheets };
}

function drawVectorSeparators(
  page: any,
  lines: Array<{ x1: number; y1: number; x2: number; y2: number }>
) {
  const color = rgb(0.72, 0.72, 0.72);
  for (const l of lines) {
    page.drawLine({
      start: { x: l.x1, y: l.y1 },
      end: { x: l.x2, y: l.y2 },
      thickness: 0.5,
      color,
    });
  }
}

async function drawVectorPageNumbers(doc: PDFDocument, start = 1) {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  pages.forEach((page, i) => {
    const label = String(start + i);
    const size = 9;
    const { width } = page.getSize();
    page.drawText(label, {
      x: (width - font.widthOfTextAtSize(label, size)) / 2,
      y: 12,
      size,
      font,
      color: rgb(0.25, 0.25, 0.25),
    });
  });
}
