/**
 * Booklet (Saddle-Stitch) Imposition Pipeline for Vector and Raster modes.
 * Supports half-page numbering, center fold/cut dashed guidelines, and spine creep adjustments.
 */

import { degrees, PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { JPEG_QUALITY, MM_TO_PT, RENDER_SCALE } from '../config';
import { filterImageData } from '../filters/worker-client';
import { ProcessingProgress, Settings, SheetCell } from '../types';
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

  const outDoc = await PDFDocument.create();
  const font = await outDoc.embedFont(StandardFonts.Helvetica);

  const drawHalfPageNumber = (page: any, pageNum: number, cell: SheetCell) => {
    if (pageNum <= 0 || bookletSettings.bookletPageNumbers === 'none') return;
    const label = String(pageNum);
    const size = 9;
    const textWidth = font.widthOfTextAtSize(label, size);
    page.drawText(label, {
      x: cell.x + (cell.w - textWidth) / 2,
      y: cell.y + 6,
      size,
      font,
      color: rgb(0.25, 0.25, 0.25),
    });
  };

  const drawCenterGuideline = (page: any, sheetW: number, sheetH: number) => {
    if (!bookletSettings.bookletCenterLine) return;
    const dashColor = rgb(0.65, 0.65, 0.65);
    const marginPt = marginMmToPt(bookletSettings.marginMm);
    page.drawLine({
      start: { x: sheetW / 2, y: marginPt },
      end: { x: sheetW / 2, y: sheetH - marginPt },
      thickness: 0.75,
      color: dashColor,
      dashArray: [4, 4],
    });
  };

  if (effectiveRaster) {
    const pdfDoc = await openPdfForRender(bytes);
    const canvas = document.createElement('canvas');
    const scale = RENDER_SCALE[bookletSettings.quality] || 2;
    const isPng = bookletSettings.blackWhite;
    const mimeType = isPng ? 'image/png' : 'image/jpeg';
    const quality = JPEG_QUALITY[bookletSettings.quality];

    let sheetW = 0;
    let sheetH = 0;
    let grid: ReturnType<typeof calculateSheetGrid> | null = null;
    let renderedCount = 0;

    const pageImageCache = new Map<number, any>();

    try {
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

      canvas.width = 600;
      canvas.height = 848;
      const bCtx = canvas.getContext('2d')!;
      bCtx.fillStyle = '#ffffff';
      bCtx.fillRect(0, 0, 600, 848);
      const blankBytes = canvasToBinaryBytes(canvas, mimeType, quality);
      const blankImage = isPng ? await outDoc.embedPng(blankBytes) : await outDoc.embedJpg(blankBytes);
      const blankDim = { w: 595.28, h: 841.89 };

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

      let sheetIndex = 0;
      for (const bs of bookletSheets) {
        // Creep offset calculation for spine shift (mm to pt)
        const creepPt = (sheetIndex * bookletSettings.bookletCreepMm * MM_TO_PT) / 2;

        const renderSide = (pair: { leftPageNum: number; rightPageNum: number }) => {
          if (signal?.aborted) throw new DOMException('Processing cancelled', 'AbortError');
          const page = outDoc.addPage([sheetW, sheetH]);
          const leftItem = pair.leftPageNum > 0 ? pageImageCache.get(pair.leftPageNum) : { image: blankImage, ...blankDim };
          const rightItem = pair.rightPageNum > 0 ? pageImageCache.get(pair.rightPageNum) : { image: blankImage, ...blankDim };

          const cellL: SheetCell = { ...grid!.cells[0], x: grid!.cells[0].x + creepPt };
          const cellR: SheetCell = { ...grid!.cells[1], x: grid!.cells[1].x - creepPt };

          const fitL = fitInCell(cellL, leftItem.w, leftItem.h);
          const fitR = fitInCell(cellR, rightItem.w, rightItem.h);

          page.drawImage(leftItem.image, { x: fitL.x, y: fitL.y, width: fitL.w, height: fitL.h });
          page.drawImage(rightItem.image, { x: fitR.x, y: fitR.y, width: fitR.w, height: fitR.h });

          if (bookletSettings.bookletPageNumbers === 'each') {
            drawHalfPageNumber(page, pair.leftPageNum, cellL);
            drawHalfPageNumber(page, pair.rightPageNum, cellR);
          }

          drawCenterGuideline(page, sheetW, sheetH);

          if (bookletSettings.separators && grid!.lines.length > 0) {
            const sepColor = rgb(0.72, 0.72, 0.72);
            for (const line of grid!.lines) {
              page.drawLine({ start: { x: line.x1, y: line.y1 }, end: { x: line.x2, y: line.y2 }, thickness: 0.5, color: sepColor });
            }
          }
        };

        renderSide(bs.front);
        renderSide(bs.back);

        sheetIndex++;
        onProgress?.({
          fraction: 0.55 + (0.4 * (sheetIndex * 2)) / totalPhysicalPages,
          message: `Assembling booklet sheet ${sheetIndex} of ${bookletSheets.length}`,
          stage: 'arranging',
        });
      }

      if (bookletSettings.pageNumbers && bookletSettings.bookletPageNumbers === 'sheet') {
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

    let sheetIndex = 0;
    for (const bs of bookletSheets) {
      if (signal?.aborted) throw new DOMException('Processing cancelled', 'AbortError');

      const creepPt = (sheetIndex * bookletSettings.bookletCreepMm * MM_TO_PT) / 2;

      const drawSidePair = (pair: { leftPageNum: number; rightPageNum: number }) => {
        const page = outDoc.addPage([sheetW, sheetH]);
        const cellL: SheetCell = { ...grid.cells[0], x: grid.cells[0].x + creepPt };
        const cellR: SheetCell = { ...grid.cells[1], x: grid.cells[1].x - creepPt };

        const drawSingle = (pageNum: number, cell: SheetCell) => {
          if (pageNum <= 0) return;
          const idx = pageNum - 1;
          const { w, h, rot } = displayed[idx];
          const fit = fitInCell(cell, w, h);
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

        drawSingle(pair.leftPageNum, cellL);
        drawSingle(pair.rightPageNum, cellR);

        if (bookletSettings.bookletPageNumbers === 'each') {
          drawHalfPageNumber(page, pair.leftPageNum, cellL);
          drawHalfPageNumber(page, pair.rightPageNum, cellR);
        }

        drawCenterGuideline(page, sheetW, sheetH);

        if (bookletSettings.separators && grid.lines.length > 0) {
          const sepColor = rgb(0.72, 0.72, 0.72);
          for (const line of grid.lines) {
            page.drawLine({ start: { x: line.x1, y: line.y1 }, end: { x: line.x2, y: line.y2 }, thickness: 0.5, color: sepColor });
          }
        }
      };

      drawSidePair(bs.front);
      drawSidePair(bs.back);

      sheetIndex++;
      onProgress?.({
        fraction: (sheetIndex * 2) / totalPhysicalPages,
        message: `Assembling booklet sheet ${sheetIndex} of ${bookletSheets.length}`,
        stage: 'arranging',
      });
    }

    if (bookletSettings.pageNumbers && bookletSettings.bookletPageNumbers === 'sheet') {
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
