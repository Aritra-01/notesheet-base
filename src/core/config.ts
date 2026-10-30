import { PaperSize, PresetLayout, QualityPreset, Settings } from './types';

export const MM_TO_PT = 72 / 25.4;

export const PAPER_SIZES_PT: Record<Exclude<PaperSize, 'original'>, [number, number]> = {
  a4: [595.28, 841.89],
  a5: [419.53, 595.28],
  a3: [841.89, 1190.55],
  letter: [612.0, 792.0],
  legal: [612.0, 1008.0],
};

export const RENDER_SCALE: Record<QualityPreset, number> = {
  low: 1.25,
  medium: 2.0,
  high: 3.0,
};

export const JPEG_QUALITY: Record<QualityPreset, number> = {
  low: 0.8,
  medium: 0.88,
  high: 0.94,
};

export const MAX_CANVAS_SIDE = 4096;

export const DEFAULT_SETTINGS: Settings = {
  invert: true,
  whiteBackground: true,
  preserveImages: true,
  clearBackground: false,
  grayscale: false,
  blackWhite: false,
  rows: 3,
  cols: 1,
  paper: 'a4',
  orientation: 'portrait',
  marginMm: 10,
  gapMm: 4,
  quality: 'medium',
  separators: false,
  pageNumbers: false,
  pageNumberStart: 1,
};

export const PRESET_LAYOUTS: PresetLayout[] = [
  { id: '1-up', label: '1', rows: 1, cols: 1, orientation: 'portrait' },
  { id: '2-up', label: '2', rows: 2, cols: 1, orientation: 'portrait' },
  { id: '3-up', label: '3', rows: 3, cols: 1, orientation: 'portrait', badge: 'Best' },
  { id: '4-up', label: '4', rows: 2, cols: 2, orientation: 'landscape' },
  { id: '6-up', label: '6', rows: 3, cols: 2, orientation: 'portrait' },
  { id: '8-up', label: '8', rows: 4, cols: 2, orientation: 'portrait' },
];

export const STORAGE_KEY = 'notesheet:settings:v1';
