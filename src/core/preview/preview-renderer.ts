/**
 * Interactive Live Sheet Preview Renderer.
 * Draws the first generated output sheet onto a canvas so users see live changes in real time.
 */

import * as pdfjsLib from 'pdfjs-dist';
import { generateBookletSheets } from '../engine/booklet-math';
import {
  calculateSheetGrid,
  calculateSheetSize,
  fitInCell,
  gapMmToPt,
  marginMmToPt,
} from '../engine/layout-math';
import { MM_TO_PT } from '../config';
import { renderPdfPage } from '../engine/pdfjs-wrapper';
import { filterPipeline } from '../filters/filter-pipeline';
import { Settings, SheetCell } from '../types';

export interface PreviewRenderResult {
  sheetW: number;
  sheetH: number;
}

/**
 * Renders the preview of the first output sheet onto targetCanvas
 */
export async function renderPreviewSheet(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageNumbers: number[],
  settings: Settings,
  targetCanvas: HTMLCanvasElement,
  maxSide = 840
): Promise<PreviewRenderResult | null> {
  if (pageNumbers.length === 0) {
    targetCanvas.width = 0;
    targetCanvas.height = 0;
    return null;
  }

  const scratchCanvas = document.createElement('canvas');
  const firstPage = await pdfDoc.getPage(pageNumbers[0]);
  const firstVp = firstPage.getViewport({ scale: 1 });

  if (settings.booklet) {
    // Booklet mode preview: render first sheet front side (left: last page, right: page 1)
    const bookletSheets = generateBookletSheets(pageNumbers);
    if (bookletSheets.length === 0) return null;
    const frontPair = bookletSheets[0].front;

    const bookletSettings: Settings = {
      ...settings,
      rows: 1,
      cols: 2,
      orientation: 'landscape',
    };

    const [sheetW, sheetH] = calculateSheetSize(bookletSettings, firstVp.width, firstVp.height);
    const scaleRatio = maxSide / Math.max(sheetW, sheetH);
    targetCanvas.width = Math.round(sheetW * scaleRatio);
    targetCanvas.height = Math.round(sheetH * scaleRatio);

    const ctx = targetCanvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetCanvas.width, targetCanvas.height);

    const grid = calculateSheetGrid(
      sheetW,
      sheetH,
      1,
      2,
      marginMmToPt(bookletSettings.marginMm),
      gapMmToPt(bookletSettings.gapMm)
    );

    const creepPt = 0; // Sheet 0 has 0 creep
    const cellL: SheetCell = { ...grid.cells[0], x: grid.cells[0].x + creepPt };
    const cellR: SheetCell = { ...grid.cells[1], x: grid.cells[1].x - creepPt };

    const renderHalfPage = async (pageNum: number, cell: SheetCell) => {
      if (pageNum <= 0) return;
      const previewScale = Math.min(2.0, (maxSide / Math.max(firstVp.width, firstVp.height)) * 1.2);
      const rendered = await renderPdfPage(pdfDoc, pageNum, previewScale, scratchCanvas);

      if (settings.invert || settings.clearBackground || settings.grayscale || settings.blackWhite) {
        const img = rendered.ctx.getImageData(0, 0, scratchCanvas.width, scratchCanvas.height);
        filterPipeline.execute(img.data, img.width, img.height, settings);
        rendered.ctx.putImageData(img, 0, 0);
      }

      const fit = fitInCell(cell, rendered.widthPt, rendered.heightPt);
      const drawX = fit.x * scaleRatio;
      const drawY = (sheetH - fit.y - fit.h) * scaleRatio;
      const drawW = fit.w * scaleRatio;
      const drawH = fit.h * scaleRatio;

      ctx.drawImage(scratchCanvas, drawX, drawY, drawW, drawH);

      // Half page number
      if (settings.bookletPageNumbers === 'each') {
        ctx.fillStyle = '#404040';
        ctx.font = `${Math.max(9, Math.round(9 * scaleRatio))}px Helvetica, Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(String(pageNum), (cell.x + cell.w / 2) * scaleRatio, (sheetH - cell.y - 6) * scaleRatio);
      }
    };

    await renderHalfPage(frontPair.leftPageNum, cellL);
    await renderHalfPage(frontPair.rightPageNum, cellR);

    // Center guideline
    if (settings.bookletCenterLine) {
      ctx.strokeStyle = '#aaaaaa';
      ctx.lineWidth = 1;
      ctx.setLineDash([4 * scaleRatio, 4 * scaleRatio]);
      ctx.beginPath();
      ctx.moveTo((sheetW / 2) * scaleRatio, marginMmToPt(bookletSettings.marginMm) * scaleRatio);
      ctx.lineTo((sheetW / 2) * scaleRatio, (sheetH - marginMmToPt(bookletSettings.marginMm)) * scaleRatio);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (settings.separators && grid.lines.length > 0) {
      ctx.strokeStyle = '#b8b8b8';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const l of grid.lines) {
        ctx.moveTo(l.x1 * scaleRatio, (sheetH - l.y1) * scaleRatio);
        ctx.lineTo(l.x2 * scaleRatio, (sheetH - l.y2) * scaleRatio);
      }
      ctx.stroke();
    }

    scratchCanvas.width = scratchCanvas.height = 0;
    return { sheetW, sheetH };
  }

  // Standard N-up grid preview
  const perSheet = settings.rows * settings.cols;
  const batch = pageNumbers.slice(0, perSheet);

  const isSingleOriginal = perSheet === 1 && settings.paper === 'original';
  const [sheetW, sheetH] = isSingleOriginal
    ? [firstVp.width, firstVp.height]
    : calculateSheetSize(settings, firstVp.width, firstVp.height);

  const scaleRatio = maxSide / Math.max(sheetW, sheetH);
  targetCanvas.width = Math.round(sheetW * scaleRatio);
  targetCanvas.height = Math.round(sheetH * scaleRatio);

  const ctx = targetCanvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetCanvas.width, targetCanvas.height);

  const { cells, lines } = calculateSheetGrid(
    sheetW,
    sheetH,
    settings.rows,
    settings.cols,
    marginMmToPt(settings.marginMm),
    gapMmToPt(settings.gapMm)
  );

  for (let i = 0; i < batch.length; i++) {
    const pageNum = batch[i];
    const previewScale = Math.min(
      2.0,
      (maxSide / Math.max(firstVp.width, firstVp.height)) * 1.2
    );

    const rendered = await renderPdfPage(pdfDoc, pageNum, previewScale, scratchCanvas);

    if (settings.invert || settings.clearBackground || settings.grayscale || settings.blackWhite) {
      const img = rendered.ctx.getImageData(0, 0, scratchCanvas.width, scratchCanvas.height);
      filterPipeline.execute(img.data, img.width, img.height, settings);
      rendered.ctx.putImageData(img, 0, 0);
    }

    const fit = isSingleOriginal
      ? { x: 0, y: 0, w: sheetW, h: sheetH }
      : fitInCell(cells[i], rendered.widthPt, rendered.heightPt);

    const drawX = fit.x * scaleRatio;
    const drawY = (sheetH - fit.y - fit.h) * scaleRatio;
    const drawW = fit.w * scaleRatio;
    const drawH = fit.h * scaleRatio;

    ctx.drawImage(scratchCanvas, drawX, drawY, drawW, drawH);
  }

  if (settings.separators && !isSingleOriginal && lines.length > 0) {
    ctx.strokeStyle = '#b8b8b8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const l of lines) {
      ctx.moveTo(l.x1 * scaleRatio, (sheetH - l.y1) * scaleRatio);
      ctx.lineTo(l.x2 * scaleRatio, (sheetH - l.y2) * scaleRatio);
    }
    ctx.stroke();
  }

  if (settings.pageNumbers) {
    ctx.fillStyle = '#404040';
    ctx.font = `${Math.max(10, Math.round(9 * scaleRatio))}px Helvetica, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(
      String(settings.pageNumberStart),
      (sheetW / 2) * scaleRatio,
      (sheetH - 12) * scaleRatio
    );
  }

  scratchCanvas.width = scratchCanvas.height = 0;
  return { sheetW, sheetH };
}
