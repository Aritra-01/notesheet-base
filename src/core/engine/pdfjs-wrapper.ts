/**
 * Wrapper for pdfjs-dist rendering
 */

import * as pdfjsLib from 'pdfjs-dist';
import { MAX_CANVAS_SIDE } from '../config';

// Configure PDF.js worker
if (typeof window !== 'undefined') {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
  } catch (err) {
    console.warn('Failed to resolve PDF.js worker URL, fallback to default:', err);
  }
}

export function openPdfForRender(bytes: Uint8Array): Promise<pdfjsLib.PDFDocumentProxy> {
  // Pass a copy so worker transfers don't detach caller's buffer
  return pdfjsLib.getDocument({
    data: bytes.slice(),
    verbosity: 0,
  }).promise;
}

export interface RenderPageResult {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  widthPt: number;
  heightPt: number;
}

/**
 * Renders a 1-based page number to an existing or newly created HTML5 Canvas
 */
export async function renderPdfPage(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  scale: number,
  targetCanvas?: HTMLCanvasElement
): Promise<RenderPageResult> {
  const page = await pdfDoc.getPage(pageNumber);
  let viewport = page.getViewport({ scale });

  // Clamp canvas side to prevent out-of-memory or canvas crash
  const longest = Math.max(viewport.width, viewport.height);
  if (longest > MAX_CANVAS_SIDE) {
    viewport = page.getViewport({ scale: (scale * MAX_CANVAS_SIDE) / longest });
  }

  const canvas = targetCanvas || document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  const ctx = canvas.getContext('2d', {
    willReadFrequently: true,
    alpha: false,
  });

  if (!ctx) {
    throw new Error('Failed to get 2D canvas context');
  }

  // Paint white background before rendering
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({
    canvasContext: ctx as any,
    viewport,
    intent: 'print',
    canvas: canvas as any,
  } as any).promise;

  // 1x scale dimensions in PDF points
  const ptViewport = page.getViewport({ scale: 1 });

  return {
    ctx,
    canvas,
    widthPt: ptViewport.width,
    heightPt: ptViewport.height,
  };
}
