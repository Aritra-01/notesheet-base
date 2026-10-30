/**
 * Worker Client bridge to communicate with filter-worker.ts
 */

import { Settings } from '../types';
import { filterPipeline } from './filter-pipeline';

let worker: Worker | null = null;
let nextJobId = 0;
const pendingJobs = new Map<
  number,
  {
    resolve: (img: ImageData) => void;
    reject: (err: Error) => void;
    width: number;
    height: number;
  }
>();

function getWorker(): Worker | null {
  if (worker !== null) return worker;
  try {
    worker = new Worker(new URL('./filter-worker.ts', import.meta.url), {
      type: 'module',
    });

    worker.onmessage = (e: MessageEvent) => {
      const { id, buffer, error } = e.data;
      const job = pendingJobs.get(id);
      if (!job) return;
      pendingJobs.delete(id);

      if (error) {
        job.reject(new Error(error));
      } else if (buffer) {
        const resultImageData = new ImageData(
          new Uint8ClampedArray(buffer),
          job.width,
          job.height
        );
        job.resolve(resultImageData);
      }
    };

    worker.onerror = (e: ErrorEvent) => {
      for (const job of pendingJobs.values()) {
        job.reject(new Error(`Filter worker error: ${e.message}`));
      }
      pendingJobs.clear();
      worker = null;
    };
  } catch (err) {
    console.warn('Web Workers unavailable or failed to initialize; falling back to main thread:', err);
    worker = null;
  }
  return worker;
}

/**
 * Filter an ImageData object using Web Worker (or main thread fallback)
 */
export function filterImageData(imageData: ImageData, settings: Settings): Promise<ImageData> {
  const w = getWorker();
  if (!w) {
    filterPipeline.execute(imageData.data, imageData.width, imageData.height, settings);
    return Promise.resolve(imageData);
  }

  const id = nextJobId++;
  // Clone buffer so it can be transferred without detaching original if needed
  const bufferCopy = imageData.data.buffer.slice(0);

  return new Promise((resolve, reject) => {
    pendingJobs.set(id, {
      resolve: (filteredData) => {
        // Also run custom registered plugins on the main thread if any are registered
        if (filterPipeline.getPlugins().length > 0) {
          filterPipeline.execute(filteredData.data, filteredData.width, filteredData.height, settings);
        }
        resolve(filteredData);
      },
      reject,
      width: imageData.width,
      height: imageData.height,
    });

    w.postMessage(
      {
        id,
        buffer: bufferCopy,
        width: imageData.width,
        height: imageData.height,
        settings,
      },
      [bufferCopy]
    );
  });
}
