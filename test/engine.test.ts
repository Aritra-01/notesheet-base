/**
 * Automated Verification Test for NoteSheet Base Core Engine
 */

import assert from 'node:assert';
import { PDFDocument, rgb } from 'pdf-lib';
import { calculateSheetGrid, calculateSheetSize, fitInCell } from '../src/core/engine/layout-math';
import { mergePdfFiles } from '../src/core/engine/pdf-merger';
import { processVector } from '../src/core/engine/vector-pipeline';
import {
  adaptiveThreshold,
  detectBackground,
  dominantColor,
  luma,
  smartInvertLabels,
  whitePointStrength,
} from '../src/core/filters/pixel-filters';
import { DEFAULT_SETTINGS } from '../src/core/config';

async function createMockSlidePdf(numPages = 3): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 1; i <= numPages; i++) {
    const page = doc.addPage([800, 450]); // 16:9 widescreen slide
    // Dark chalkboard/navy background
    page.drawRectangle({
      x: 0,
      y: 0,
      width: 800,
      height: 450,
      color: rgb(0.08, 0.12, 0.18),
    });
    // White text
    page.drawText(`Test Slide #${i} - Lecture Notes`, {
      x: 60,
      y: 350,
      size: 28,
      color: rgb(1, 1, 1),
    });
  }
  return doc.save();
}

async function runTests() {
  console.log('--- 1. Testing Luma Calculation ---');
  assert.strictEqual(luma(0, 0, 0), 0);
  assert.strictEqual(luma(255, 255, 255), 255);
  const midLuma = luma(20, 30, 45);
  assert.ok(midLuma < 110, 'Dark navy pixel correctly classified as dark');
  console.log('✓ Luma math verified');

  console.log('--- 2. Testing Dominant Background & White Point Dodge ---');
  const width = 100;
  const height = 100;
  const darkNavyPixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height * 4; i += 4) {
    darkNavyPixels[i] = 18;     // R
    darkNavyPixels[i + 1] = 25; // G
    darkNavyPixels[i + 2] = 40; // B
    darkNavyPixels[i + 3] = 255;
  }
  const dom = dominantColor(width, height, darkNavyPixels);
  assert.ok(dom !== null, 'Dominant color found');
  assert.ok(dom.share > 0.9, 'Dominant color covers over 90% of area');

  const bg = detectBackground(width, height, darkNavyPixels);
  assert.ok(bg !== null, 'Dark background detected');

  const [dr, dg, db] = whitePointStrength(bg!);
  assert.ok(dr > 0 && dg > 0 && db > 0, 'Color dodge strengths calculated');
  console.log('✓ Background detection & white point calculation verified');

  console.log('--- 3. Testing Smart Invert Region Segmentation ---');
  const labels = smartInvertLabels(width, height, darkNavyPixels);
  assert.strictEqual(labels.length, width * height);
  assert.ok(labels[0] > 0, 'Dark background region flagged for inversion');
  console.log('✓ Smart invert segmentation verified');

  console.log('--- 4. Testing Bradley Adaptive Thresholding ---');
  adaptiveThreshold(width, height, darkNavyPixels, 16, 5);
  // Pure monochrome output (either 0 or 255)
  assert.ok(darkNavyPixels[0] === 0 || darkNavyPixels[0] === 255);
  console.log('✓ Adaptive thresholding verified');

  console.log('--- 5. Testing Layout Grid Geometry (3-up A4) ---');
  const [sheetW, sheetH] = calculateSheetSize(
    { ...DEFAULT_SETTINGS, rows: 3, cols: 1, paper: 'a4', orientation: 'portrait' },
    800,
    450
  );
  assert.ok(sheetW < sheetH, 'A4 portrait orientation is vertical');
  const grid = calculateSheetGrid(sheetW, sheetH, 3, 1, 28, 12);
  assert.strictEqual(grid.cells.length, 3, 'Calculated exactly 3 cells');
  assert.strictEqual(grid.lines.length, 2, 'Calculated 2 horizontal separator lines');

  const fit = fitInCell(grid.cells[0], 800, 450);
  assert.ok(fit.w <= grid.cells[0].w, 'Fitted width fits within cell');
  assert.ok(fit.h <= grid.cells[0].h, 'Fitted height fits within cell');
  console.log('✓ Sheet layout geometry verified');

  console.log('--- 6. Testing Multi-PDF Merging ---');
  const pdfBytes1 = await createMockSlidePdf(2);
  const pdfBytes2 = await createMockSlidePdf(3);
  const file1 = new File([pdfBytes1 as unknown as BlobPart], 'lecture1.pdf', { type: 'application/pdf' });
  const file2 = new File([pdfBytes2 as unknown as BlobPart], 'lecture2.pdf', { type: 'application/pdf' });

  const mergedBytes = await mergePdfFiles([file1, file2]);
  const mergedDoc = await PDFDocument.load(mergedBytes);
  assert.strictEqual(mergedDoc.getPageCount(), 5, 'Merged exactly 2 + 3 = 5 pages');
  console.log('✓ PDF merger verified');

  console.log('--- 7. Testing Vector Inversion & 3-up Tiling ---');
  const vectorResult = await processVector(
    mergedBytes,
    [1, 2, 3, 4, 5],
    {
      ...DEFAULT_SETTINGS,
      rows: 3,
      cols: 1,
      paper: 'a4',
      orientation: 'portrait',
      separators: true,
      pageNumbers: true,
      pageNumberStart: 1,
    }
  );

  assert.strictEqual(vectorResult.sheets, 2, '5 slides tiled 3-per-sheet yields 2 sheets');
  const vectorOutDoc = await PDFDocument.load(vectorResult.bytes);
  assert.strictEqual(vectorOutDoc.getPageCount(), 2, 'Output PDF has 2 sheets');
  console.log('✓ Vector 3-up transformation verified');

  console.log('\n========================================');
  console.log('ALL CORE ENGINE VERIFICATION TESTS PASSED!');
  console.log('========================================\n');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
