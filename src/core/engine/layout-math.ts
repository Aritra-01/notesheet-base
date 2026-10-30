/**
 * Layout and coordinate math for N-up sheet placement, margins, gaps, and separators.
 */

import { MM_TO_PT, PAPER_SIZES_PT } from '../config';
import { FittedPlacement, Settings, SheetCell, SheetGridResult } from '../types';

/**
 * Calculates sheet dimensions in PDF points (72 pt / inch)
 */
export function calculateSheetSize(
  settings: Settings,
  firstPageW: number,
  firstPageH: number
): [number, number] {
  let w: number;
  let h: number;

  if (settings.paper === 'original') {
    w = firstPageW;
    h = firstPageH;
  } else {
    [w, h] = PAPER_SIZES_PT[settings.paper];
  }

  const wantLandscape = settings.orientation === 'landscape';
  if ((w > h) !== wantLandscape) {
    [w, h] = [h, w];
  }

  return [w, h];
}

/**
 * Calculates cell positions on a sheet in PDF coordinates (origin: bottom-left).
 * Top row starts near sheetH - margin.
 */
export function calculateSheetGrid(
  sheetW: number,
  sheetH: number,
  rows: number,
  cols: number,
  marginPt: number,
  gapPt: number
): SheetGridResult {
  const gapX = cols > 1 ? Math.min(gapPt, ((sheetW - marginPt * 2) * 0.5) / (cols - 1)) : 0;
  const gapY = rows > 1 ? Math.min(gapPt, ((sheetH - marginPt * 2) * 0.5) / (rows - 1)) : 0;

  const totalGapsX = gapX * (cols - 1);
  const totalGapsY = gapY * (rows - 1);

  const cellW = (sheetW - marginPt * 2 - totalGapsX) / cols;
  const cellH = (sheetH - marginPt * 2 - totalGapsY) / rows;

  const cells: SheetCell[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({
        x: marginPt + c * (cellW + gapX),
        y: sheetH - marginPt - (r + 1) * cellH - r * gapY,
        w: cellW,
        h: cellH,
      });
    }
  }

  const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];

  // Vertical separator lines
  for (let c = 1; c < cols; c++) {
    const x = marginPt + c * cellW + (c - 0.5) * gapX;
    lines.push({ x1: x, y1: marginPt, x2: x, y2: sheetH - marginPt });
  }

  // Horizontal separator lines
  for (let r = 1; r < rows; r++) {
    const y = sheetH - marginPt - r * cellH - (r - 0.5) * gapY;
    lines.push({ x1: marginPt, y1: y, x2: sheetW - marginPt, y2: y });
  }

  return { cells, lines };
}

/**
 * Fits content of size (w, h) into bounding box `cell`, maintaining aspect ratio and centering.
 */
export function fitInCell(cell: SheetCell, w: number, h: number): FittedPlacement {
  const scale = Math.min(cell.w / w, cell.h / h);
  const dw = w * scale;
  const dh = h * scale;
  return {
    x: cell.x + (cell.w - dw) / 2,
    y: cell.y + (cell.h - dh) / 2,
    w: dw,
    h: dh,
    scale,
  };
}

export function marginMmToPt(marginMm: number): number {
  return marginMm * MM_TO_PT;
}

export function gapMmToPt(gapMm: number): number {
  return gapMm * MM_TO_PT;
}
