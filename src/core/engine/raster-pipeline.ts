/**
 * Pixel-Accurate Raster PDF Pipeline.
 * Renders pages using PDF.js, processes pixels in Web Worker, embeds compressed images in PDF-lib.
 */

import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { JPEG_QUALITY, RENDER_SCALE } from '../config';
import { filterImageData } from '../filters/worker-client';
import { ProcessingProgress, Settings } from '../types';
import {
  calculateSheetGrid,
  calculateSheetSize,
  fitInCell,
  gapMmToPt,
  marginMmToPt,
} from './layout-math';
import { openPdfForRender, renderPdfPage } from './pdfjs-wrapper';

/**
 * Synchronous, fast canvas to binary bytes conversion
 */
function canvasToBinaryBytes(canvas: HTMLCanvasElement, mimeType: string, quality: number): Uint8Array {
  const dataUrl = canvas.toDataURL(mimeType, quality);
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function processRaster(
  bytes: Uint8Array,
  pageNumbers: number[],
  settings: Settings,
  onProgress?: (progress: ProcessingProgress) => void,
  signal?: AbortSignal
): Promise<{ bytes: Uint8Array; sheets: number }> {
  const pdfDoc = await openPdfForRender(bytes);
  const outDoc = await PDFDocument.create();
  const canvas = document.createElement('canvas');

  const scale = RENDER_SCALE[settings.quality] || 2;
  const isPng = settings.blackWhite; // Pure 2-tone compresses drastically better as PNG
  const mimeType = isPng ? 'image/png' : 'image/jpeg';
  const quality = JPEG_QUALITY[settings.quality];

  const perSheet = settings.rows * settings.cols;
  const isSingleOriginal = perSheet === 1 && settings.paper === 'original';
  const sheets = Math.ceil(pageNumbers.length / perSheet);

  let sheetW = 0;
  let sheetH = 0;
  let grid: ReturnType<typeof calculateSheetGrid> | null = null;
  let completedPages = 0;

  try {
    for (let s = 0; s < sheets; s++) {
      if (signal?.aborted) throw new DOMException('Processing cancelled', 'AbortError');

      const batch = pageNumbers.slice(s * perSheet, (s + 1) * perSheet);
      const placedPages: Array<{ image: any; w: number; h: number }> = [];

      for (const pageNum of batch) {
        if (signal?.aborted) throw new DOMException('Processing cancelled', 'AbortError');

        // 1. Render page to canvas
        const rendered = await renderPdfPage(pdfDoc, pageNum, scale, canvas);

        // 2. Extract ImageData
        let imgData = rendered.ctx.getImageData(0, 0, canvas.width, canvas.height);

        // 3. Process through Web Worker filter pipeline
        imgData = await filterImageData(imgData, settings);

        // 4. Put filtered pixels back
        rendered.ctx.putImageData(imgData, 0, 0);

        // 5. Compress to binary image & embed in PDF
        const imgBytes = canvasToBinaryBytes(canvas, mimeType, quality);
        const embeddedImg = isPng
          ? await outDoc.embedPng(imgBytes)
          : await outDoc.embedJpg(imgBytes);

        placedPages.push({
          image: embeddedImg,
          w: rendered.widthPt,
          h: rendered.heightPt,
        });

        completedPages++;
        onProgress?.({
          fraction: 0.05 + (0.85 * completedPages) / pageNumbers.length,
          message: `Processed page ${completedPages} of ${pageNumbers.length}`,
          stage: 'rendering',
        });
      }

      if (isSingleOriginal) {
        const p = placedPages[0];
        outDoc.addPage([p.w, p.h]).drawImage(p.image, {
          x: 0,
          y: 0,
          width: p.w,
          height: p.h,
        });
      } else {
        if (!grid) {
          [sheetW, sheetH] = calculateSheetSize(settings, placedPages[0].w, placedPages[0].h);
          grid = calculateSheetGrid(
            sheetW,
            sheetH,
            settings.rows,
            settings.cols,
            marginMmToPt(settings.marginMm),
            gapMmToPt(settings.gapMm)
          );
        }

        const page = outDoc.addPage([sheetW, sheetH]);
        placedPages.forEach((p, idx) => {
          const fit = fitInCell(grid!.cells[idx], p.w, p.h);
          page.drawImage(p.image, {
            x: fit.x,
            y: fit.y,
            width: fit.w,
            height: fit.h,
          });
        });

        if (settings.separators && grid.lines.length > 0) {
          const sepColor = rgb(0.72, 0.72, 0.72);
          for (const line of grid.lines) {
            page.drawLine({
              start: { x: line.x1, y: line.y1 },
              end: { x: line.x2, y: line.y2 },
              thickness: 0.5,
              color: sepColor,
            });
          }
        }
      }

      // Yield event loop
      await new Promise((r) => setTimeout(r, 0));
    }
  } finally {
    canvas.width = canvas.height = 0;
    (pdfDoc as any).destroy?.() ?? pdfDoc.cleanup?.();
  }

  if (settings.pageNumbers) {
    const font = await outDoc.embedFont(StandardFonts.Helvetica);
    const pages = outDoc.getPages();
    pages.forEach((page, i) => {
      const label = String(settings.pageNumberStart + i);
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

  onProgress?.({
    fraction: 0.98,
    message: 'Finalizing PDF output…',
    stage: 'saving',
  });

  return { bytes: await outDoc.save(), sheets };
}
