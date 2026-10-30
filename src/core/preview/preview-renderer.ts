/**
 * Interactive Live Sheet Preview Renderer.
 * Draws the first generated output sheet onto a canvas so users see live changes in real time.
 */

import * as pdfjsLib from 'pdfjs-dist';
import {
  calculateSheetGrid,
  calculateSheetSize,
  fitInCell,
  gapMmToPt,
  marginMmToPt,
} from '../engine/layout-math';
import { renderPdfPage } from '../engine/pdfjs-wrapper';
import { filterPipeline } from '../filters/filter-pipeline';
import { Settings } from '../types';

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
  const perSheet = settings.rows * settings.cols;
  const batch = pageNumbers.slice(0, perSheet);

  if (batch.length === 0) {
    targetCanvas.width = 0;
    targetCanvas.height = 0;
    return null;
  }

  const scratchCanvas = document.createElement('canvas');
  const firstPage = await pdfDoc.getPage(batch[0]);
  const firstVp = firstPage.getViewport({ scale: 1 });

  const isSingleOriginal = perSheet === 1 && settings.paper === 'original';
  const [sheetW, sheetH] = isSingleOriginal
    ? [firstVp.width, firstVp.height]
    : calculateSheetSize(settings, firstVp.width, firstVp.height);

  const scaleRatio = maxSide / Math.max(sheetW, sheetH);
  targetCanvas.width = Math.round(sheetW * scaleRatio);
  targetCanvas.height = Math.round(sheetH * scaleRatio);

  const ctx = targetCanvas.getContext('2d');
  if (!ctx) return null;

  // Background of the physical paper sheet
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

    // Apply active pixel filters to the preview canvas
    if (settings.invert || settings.clearBackground || settings.grayscale || settings.blackWhite) {
      const img = rendered.ctx.getImageData(0, 0, scratchCanvas.width, scratchCanvas.height);
      filterPipeline.execute(img.data, img.width, img.height, settings);
      rendered.ctx.putImageData(img, 0, 0);
    }

    const fit = isSingleOriginal
      ? { x: 0, y: 0, w: sheetW, h: sheetH }
      : fitInCell(cells[i], rendered.widthPt, rendered.heightPt);

    // Canvas coordinate system is top-left origin; PDF is bottom-left origin.
    // PDF coordinate conversion: yCanvas = sheetH - yPdf - height
    const drawX = fit.x * scaleRatio;
    const drawY = (sheetH - fit.y - fit.h) * scaleRatio;
    const drawW = fit.w * scaleRatio;
    const drawH = fit.h * scaleRatio;

    ctx.drawImage(scratchCanvas, drawX, drawY, drawW, drawH);
  }

  // Draw separator lines if enabled
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

  // Draw page numbers preview if enabled
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
