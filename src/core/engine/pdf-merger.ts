/**
 * In-browser PDF Merger using pdf-lib
 */

import { PDFDocument } from 'pdf-lib';
import { ProcessingProgress } from '../types';

export async function mergePdfFiles(
  files: File[],
  onProgress?: (progress: ProcessingProgress) => void
): Promise<Uint8Array> {
  if (files.length === 0) {
    throw new Error('No PDF files provided to merge.');
  }

  if (files.length === 1) {
    onProgress?.({
      fraction: 1.0,
      message: 'Loaded file',
      stage: 'merging',
    });
    return new Uint8Array(await files[0].arrayBuffer());
  }

  const mergedDoc = await PDFDocument.create();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress?.({
      fraction: i / files.length,
      message: `Merging ${file.name} (${i + 1}/${files.length})`,
      stage: 'merging',
    });

    const fileBuffer = await file.arrayBuffer();
    const sourceDoc = await PDFDocument.load(fileBuffer, {
      ignoreEncryption: true,
      updateMetadata: false,
    });

    const pageIndices = sourceDoc.getPageIndices();
    const copiedPages = await mergedDoc.copyPages(sourceDoc, pageIndices);
    copiedPages.forEach((page) => mergedDoc.addPage(page));

    // Allow UI to breathe
    await new Promise((r) => setTimeout(r, 0));
  }

  onProgress?.({
    fraction: 1.0,
    message: 'Finished merging PDFs',
    stage: 'merging',
  });

  return mergedDoc.save();
}

/**
 * Returns the page count of a PDF file using pdf-lib
 */
export async function getPdfPageCount(file: File): Promise<number> {
  const buffer = await file.arrayBuffer();
  const doc = await PDFDocument.load(buffer, {
    ignoreEncryption: true,
    updateMetadata: false,
  });
  return doc.getPageCount();
}
