/**
 * Core type definitions for NoteSheet Base
 */

export type PaperSize = 'a4' | 'a5' | 'a3' | 'letter' | 'legal' | 'original';

export type Orientation = 'portrait' | 'landscape';

export type QualityPreset = 'low' | 'medium' | 'high';

export type PipelineType = 'vector' | 'raster';

export interface Settings {
  // Color & Image Filters
  invert: boolean;
  whiteBackground: boolean;
  preserveImages: boolean; // Smart invert for pasted screenshots
  clearBackground: boolean;
  grayscale: boolean;
  blackWhite: boolean;

  // Layout & Sheet Grid
  rows: number;
  cols: number;
  paper: PaperSize;
  orientation: Orientation;
  marginMm: number;
  gapMm: number;
  booklet: boolean;

  // Enhancements
  quality: QualityPreset;
  separators: boolean;
  pageNumbers: boolean;
  pageNumberStart: number;
}

export interface FileEntry {
  id: number;
  file: File;
  name: string;
  size: number;
  pageCount?: number;
}

export interface PresetLayout {
  id: string;
  label: string;
  rows: number;
  cols: number;
  orientation: Orientation;
  badge?: string;
  iconMiniClass?: string;
}

export interface ProcessingProgress {
  fraction: number;
  message: string;
  stage?: 'merging' | 'measuring' | 'rendering' | 'filtering' | 'arranging' | 'saving' | 'complete';
}

export interface ProcessResult {
  bytes: Uint8Array;
  sheets: number;
  pages: number;
  pipeline: PipelineType;
  size: number;
  durationSecs: number;
  blobUrl?: string;
}

export interface DominantColorResult {
  color: [number, number, number];
  share: number;
}

export interface SheetCell {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SheetGridResult {
  cells: SheetCell[];
  lines: Array<{ x1: number; y1: number; x2: number; y2: number }>;
}

export interface FittedPlacement {
  x: number;
  y: number;
  w: number;
  h: number;
  scale: number;
}

/**
 * Extensibility hook: Custom Filter Plugin Interface
 * Allows developers to easily inject custom pixel filters.
 */
export interface FilterPlugin {
  id: string;
  name: string;
  description?: string;
  enabled?: (settings: Settings) => boolean;
  apply: (data: Uint8ClampedArray, width: number, height: number, settings: Settings) => void;
}
