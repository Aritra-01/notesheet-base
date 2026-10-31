/**
 * Booklet (Saddle-Stitch) Imposition Pipeline for Vector and Raster modes.
 */

import { degrees, PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { JPEG_QUALITY, RENDER_SCALE } from '../config';
import { filterImageData } from '../filters/worker-client';
import { ProcessingProgress, Settings } from '../types';
import { generateBookletSheets } from './booklet-math';
import {
  calculateSheetGrid,
  calculateSheetSize,
  fitInCell,
  gapMmToPt,
  marginMmToPt,
} from './layout-math';
import { openPdfForRender, renderPdfPage } from './pdfjs-wrapper';

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

export async function processBooklet(
  bytes: Uint8Array,
  pageNumbers: number[],
  settings: Settings,
  isRaster: boolean,
  onProgress?: (progress: ProcessingProgress) => void,
  signal?: AbortSignal
): Promise<{ bytes: Uint8Array; sheets: number }> {
  const bookletSettings: Settings = {
    ...settings,
    rows: 1,
    cols: 2,
    orientation: 'landscape',
  };

  const bookletSheets = generateBookletSheets(pageNumbers);
  const totalPhysicalPages = bookletSheets.length * 2;

  const effectiveRaster = isRaster && typeof document !== 'undefined';

  if (effectiveRaster) {
    const pdfDoc = await openPdfForRender(bytes);
    const outDoc = await PDFDocument.create();
    const canvas = document.createElement('canvas');
    const scale = RENDER_SCALE[bookletSettings.quality] || 2;
    const isPng = bookletSettings.blackWhite;
    const mimeType = isPng ? 'image/png' : 'image/jpeg';
    const quality = JPEG_QUALITY[bookletSettings.quality];

    let sheetW = 0;
    let sheetH = 0;
    let grid: ReturnType<typeof calculateSheetGrid> | null = null;
    let renderedCount = 0;

    // Cache rendered page images to avoid re-rendering
    const pageImageCache = new Map<number, any>();

    try {
      // Collect unique non-zero page numbers to render
      const uniquePages = [...new Set(pageNumbers.filter((n) => n > 0))];
      for (const pNum of uniquePages) {
        if (signal?.aborted) throw new DOMException('Processing cancelled', 'AbortError');
        const rendered = await renderPdfPage(pdfDoc, pNum, scale, canvas);
        let imgData = rendered.ctx.getImageData(0, 0, canvas.width, canvas.height);
        imgData = await filterImageData(imgData, bookletSettings);
        rendered.ctx.putImageData(imgData, 0, 0);

        const imgBytes = canvasToBinaryBytes(canvas, mimeType, quality);
        const embeddedImg = isPng ? await outDoc.embedPng(imgBytes) : await outDoc.embedJpg(imgBytes);

        pageImageCache.set(pNum, {
          image: embeddedImg,
          w: rendered.widthPt,
          h: rendered.heightPt,
        });

        renderedCount++;
        onProgress?.({
          fraction: 0.05 + (0.5 * renderedCount) / uniquePages.length,
          message: `Rasterizing page ${renderedCount} of ${uniquePages.length}`,
          stage: 'rendering',
        });
      }

      // Create a blank white image for padding pages if needed
      canvas.width = 600;
      canvas.height = 848;
      const bCtx = canvas.getContext('2d')!;
      bCtx.fillStyle = '#ffffff';
      bCtx.fillRect(0, 0, 600, 848);
      const blankBytes = canvasToBinaryBytes(canvas, mimeType, quality);
      const blankImage = isPng ? await outDoc.embedPng(blankBytes) : await outDoc.embedJpg(blankBytes);
      const blankDim = { w: 595.28, h: 841.89 };

      // Determine sheet size from first page or default A4 landscape
      const firstCached = pageImageCache.get(uniquePages[0]) || { w: 595.28, h: 841.89 };
      [sheetW, sheetH] = calculateSheetSize(bookletSettings, firstCached.w, firstCached.h);
      grid = calculateSheetGrid(
        sheetW,
        sheetH,
        1,
        2,
        marginMmToPt(bookletSettings.marginMm),
        gapMmToPt(bookletSettings.gapMm)
      );

      let sideIndex = 0;
      for (const bs of bookletSheets) {
        // Front side
        if (signal?.aborted) throw new DOMException('Processing cancelled', 'AbortError');
        const frontPage = outDoc.addPage([sheetW, sheetH]);
        const leftF = bs.front.leftPageNum > 0 ? pageImageCache.get(bs.front.leftPageNum) : { image: blankImage, ...blankDim };
        const rightF = bs.front.rightPageNum > 0 ? pageImageCache.get(bs.front.rightPageNum) : { image: blankImage, ...blankDim };

        const fitL1 = fitInCell(grid.cells[0], leftF.w, leftF.h);
        const fitR1 = fitInCell(grid.cells[1], rightF.w, rightF.h);

        frontPage.drawImage(leftF.image, { x: fitL1.x, y: fitL1.y, width: fitL1.w, height: fitL1.h });
        frontPage.drawImage(rightF.image, { x: fitR1.x, y: fitR1.y, width: fitR1.w, height: fitR1.h });

        if (bookletSettings.separators && grid.lines.length > 0) {
          const sepColor = rgb(0.72, 0.72, 0.72);
          for (const line of grid.lines) {
            frontPage.drawLine({ start: { x: line.x1, y: line.y1 }, end: { x: line.x2, y: line.y2 }, thickness: 0.5, color: sepColor });
          }
        }

        // Back side
        if (signal?.aborted) throw new DOMException('Processing cancelled', 'AbortError');
        const backPage = outDoc.addPage([sheetW, sheetH]);
        const leftB = bs.back.leftPageNum > 0 ? pageImageCache.get(bs.back.leftPageNum) : { image: blankImage, ...blankDim };
        const rightB = bs.back.rightPageNum > 0 ? pageImageCache.get(bs.back.rightPageNum) : { image: blankImage, ...blankDim };

        const fitL2 = fitInCell(grid.cells[0], leftB.w, leftB.h);
        const fitR2 = fitInCell(grid.cells[1], rightB.w, rightB.h);

        backPage.drawImage(leftB.image, { x: fitL2.x, y: fitL2.y, width: fitL2.w, height: fitL2.h });
        backPage.drawImage(rightB.image, { x: fitR2.x, y: fitR2.y, width: fitR2.w, height: fitR2.h });

        if (bookletSettings.separators && grid.lines.length > 0) {
          const sepColor = rgb(0.72, 0.72, 0.72);
          for (const line of grid.lines) {
            backPage.drawLine({ start: { x: line.x1, y: line.y1 }, end: { x: line.x2, y: line.y2 }, thickness: 0.5, color: sepColor });
          }
        }

        sideIndex += 2;
        onProgress?.({
          fraction: 0.55 + (0.4 * sideIndex) / totalPhysicalPages,
          message: `Assembling booklet sheet ${sideIndex / 2} of ${bookletSheets.length}`,
          stage: 'arranging',
        });
      }

      if (bookletSettings.pageNumbers) {
        const font = await outDoc.embedFont(StandardFonts.Helvetica);
        outDoc.getPages().forEach((p, i) => {
          const label = String(bookletSettings.pageNumberStart + i);
          const { width } = p.getSize();
          p.drawText(label, {
            x: (width - font.widthOfTextAtSize(label, 9)) / 2,
            y: 12,
            size: 9,
            font,
            color: rgb(0.25, 0.25, 0.25),
          });
        });
      }

      return { bytes: await outDoc.save(), sheets: bookletSheets.length };
    } finally {
      canvas.width = canvas.height = 0;
      (pdfDoc as any).destroy?.() ?? pdfDoc.cleanup?.();
    }
  } else {
    // Vector booklet pipeline
    const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    const outDoc = await PDFDocument.create();

    const srcPages = pageNumbers.map((n) => srcDoc.getPage(n - 1));
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

    const [sheetW, sheetH] = calculateSheetSize(bookletSettings, displayed[0].w, displayed[0].h);
    const grid = calculateSheetGrid(
      sheetW,
      sheetH,
      1,
      2,
      marginMmToPt(bookletSettings.marginMm),
      gapMmToPt(bookletSettings.gapMm)
    );

    let sideIndex = 0;
    for (const bs of bookletSheets) {
      if (signal?.aborted) throw new DOMException('Processing cancelled', 'AbortError');

      // Helper to draw a pair onto a sheet page
      const drawSidePair = (pair: { leftPageNum: number; rightPageNum: number }) => {
        const page = outDoc.addPage([sheetW, sheetH]);
        const drawSingle = (pageNum: number, cellIdx: number) => {
          if (pageNum <= 0) return; // blank padding page
          const idx = pageNum - 1;
          const { w, h, rot } = displayed[idx];
          const fit = fitInCell(grid.cells[cellIdx], w, h);
          const ew = embedded[idx].width * fit.scale;
          const eh = embedded[idx].height * fit.scale;
          let x = fit.x;
          let y = fit.y;
          let angle = 0;
          if (rot === 90) { y = fit.y + fit.h; angle = -90; }
          else if (rot === 180) { x = fit.x + fit.w; y = fit.y + fit.h; angle = 180; }
          else if (rot === 270) { x = fit.x + fit.w; angle = 90; }
          page.drawPage(embedded[idx], { x, y, width: ew, height: eh, rotate: degrees(angle) });
        };

        drawSingle(pair.leftPageNum, 0);
        drawSingle(pair.rightPageNum, 1);

        if (bookletSettings.separators && grid.lines.length > 0) {
          const sepColor = rgb(0.72, 0.72, 0.72);
          for (const line of grid.lines) {
            page.drawLine({ start: { x: line.x1, y: line.y1 }, end: { x: line.x2, y: line.y2 }, thickness: 0.5, color: sepColor });
          }
        }
      };

      drawSidePair(bs.front);
      drawSidePair(bs.back);

      sideIndex += 2;
      onProgress?.({
        fraction: (sideIndex / totalPhysicalPages),
        message: `Assembling booklet sheet ${sideIndex / 2} of ${bookletSheets.length}`,
        stage: 'arranging',
      });
    }

    if (bookletSettings.pageNumbers) {
      const font = await outDoc.embedFont(StandardFonts.Helvetica);
      outDoc.getPages().forEach((p, i) => {
        const label = String(bookletSettings.pageNumberStart + i);
        const { width } = p.getSize();
        p.drawText(label, {
          x: (width - font.widthOfTextAtSize(label, 9)) / 2,
          y: 12,
          size: 9,
          font,
          color: rgb(0.25, 0.25, 0.25),
        });
      });
    }

    return { bytes: await outDoc.save(), sheets: bookletSheets.length };
  }
}
