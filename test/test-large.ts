import assert from 'node:assert';
import { PDFDocument, rgb } from 'pdf-lib';
import { DEFAULT_SETTINGS } from '../src/core/config';
import { processPdf } from '../src/core/engine/processor';

async function testLargePdf() {
  console.log("Generating 20-page lecture PDF...");
  const doc = await PDFDocument.create();
  for (let i = 1; i <= 20; i++) {
    const page = doc.addPage([960, 540]);
    page.drawRectangle({
      x: 0,
      y: 0,
      width: 960,
      height: 540,
      color: rgb(0.05, 0.1, 0.15),
    });
    page.drawText(`Lecture Slide ${i} - Organic Chemistry`, {
      x: 50,
      y: 400,
      size: 28,
      color: rgb(1, 1, 1),
    });
    // Add some random shapes/lines
    page.drawLine({
      start: { x: 50, y: 350 },
      end: { x: 900, y: 350 },
      thickness: 2,
      color: rgb(0.8, 0.8, 0.2),
    });
  }
  const bytes = await doc.save();
  const pages = Array.from({ length: 20 }, (_, i) => i + 1);

  console.log("Testing processPdf with Vector mode (invert=true, preserveImages=false)...");
  const resVector = await processPdf(
    bytes,
    pages,
    {
      ...DEFAULT_SETTINGS,
      invert: true,
      preserveImages: false,
      rows: 3,
      cols: 1,
      separators: true,
      pageNumbers: true,
    },
    (p) => console.log(`[Vector] ${Math.round(p.fraction * 100)}% - ${p.message}`)
  );
  console.log(`Vector success! Sheets: ${resVector.sheets}, Size: ${resVector.size} bytes`);
  assert.strictEqual(resVector.sheets, 7); // ceil(20 / 3) = 7

  console.log("Testing processPdf with default settings (invert=true, preserveImages=true -> Raster mode)...");
  // In node, processRaster will fail if document is not defined, but let's check what it does
}

testLargePdf().catch(console.error);
