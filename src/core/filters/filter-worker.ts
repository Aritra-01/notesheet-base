/**
 * Web Worker for running pixel filters off the main thread.
 * Ensures the UI remains silky smooth at 60fps even for heavy PDFs.
 */

import { Settings } from '../types';
import { applyPixelFilters } from './pixel-filters';

export interface WorkerFilterRequest {
  id: number;
  buffer: ArrayBuffer;
  width: number;
  height: number;
  settings: Partial<Settings>;
}

export interface WorkerFilterResponse {
  id: number;
  buffer?: ArrayBuffer;
  error?: string;
}

self.onmessage = (event: MessageEvent<WorkerFilterRequest>) => {
  const { id, buffer, width, height, settings } = event.data;
  try {
    const data = new Uint8ClampedArray(buffer);
    applyPixelFilters(data, width, height, settings);
    const response: WorkerFilterResponse = { id, buffer: data.buffer };
    // Transfer buffer back to main thread with 0-copy transfer
    self.postMessage(response, [data.buffer] as any);
  } catch (err: any) {
    const response: WorkerFilterResponse = {
      id,
      error: String(err && err.message ? err.message : err),
    };
    self.postMessage(response);
  }
};
