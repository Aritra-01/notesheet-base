/**
 * Main PDF Processor orchestrator.
 * Determines pipeline (Vector vs Raster) and executes processing with progress tracking.
 */

import { filterPipeline } from '../filters/filter-pipeline';
import { PipelineType, ProcessingProgress, ProcessResult, Settings } from '../types';
import { processRaster } from './raster-pipeline';
import { processVector } from './vector-pipeline';

/**
 * Checks whether the current settings require raster pixel processing
 */
export function usesRasterPipeline(settings: Settings): boolean {
  const customPluginsActive = filterPipeline
    .getPlugins()
    .some((p) => !p.enabled || p.enabled(settings));

  return (
    (settings.invert && settings.preserveImages) ||
    settings.clearBackground ||
    settings.grayscale ||
    settings.blackWhite ||
    customPluginsActive
  );
}

/**
 * Executes the complete PDF transformation pipeline
 */
export async function processPdf(
  bytes: Uint8Array,
  pageNumbers: number[],
  settings: Settings,
  onProgress?: (progress: ProcessingProgress) => void,
  signal?: AbortSignal
): Promise<ProcessResult> {
  if (pageNumbers.length === 0) {
    throw new Error('No pages selected to process.');
  }

  const isRaster = usesRasterPipeline(settings);
  const pipeline: PipelineType = isRaster ? 'raster' : 'vector';

  onProgress?.({
    fraction: 0.02,
    message: isRaster ? 'Initializing raster pixel engine…' : 'Initializing vector engine…',
    stage: 'rendering',
  });

  const startTime = performance.now();

  const { bytes: outputBytes, sheets } = isRaster
    ? await processRaster(bytes, pageNumbers, settings, onProgress, signal)
    : await processVector(bytes, pageNumbers, settings, onProgress, signal);

  const durationSecs = Number(((performance.now() - startTime) / 1000).toFixed(1));

  // Create Blob and Object URL
  const blob = new Blob([outputBytes as unknown as BlobPart], { type: 'application/pdf' });
  const blobUrl = URL.createObjectURL(blob);

  onProgress?.({
    fraction: 1.0,
    message: 'PDF successfully generated!',
    stage: 'complete',
  });

  return {
    bytes: outputBytes,
    sheets,
    pages: pageNumbers.length,
    pipeline,
    size: blob.size,
    durationSecs,
    blobUrl,
  };
}
