/**
 * Example Extension Plugin: Custom Filter Plugin
 *
 * Demonstrates how you can easily add custom image processing or annotation features.
 * To activate, simply call: `filterPipeline.register(contrastBoostPlugin);`
 */

import { FilterPlugin, Settings } from '../core/types';

/**
 * Example 1: Contrast Booster
 * Deepens text and boosts clarity for faint handwriting or chalk strokes.
 */
export const contrastBoostPlugin: FilterPlugin = {
  id: 'contrast-boost',
  name: 'Contrast Boost',
  description: 'Enhances text edge contrast for faint chalk and pencil writing',
  enabled: (settings: Settings) => (settings as any).customContrast === true,
  apply: (data: Uint8ClampedArray, width: number, height: number) => {
    // Standard linear contrast adjustment: factor = (259 * (contrast + 255)) / (255 * (259 - contrast))
    const contrast = 30; // -255 to 255
    const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

    for (let p = 0; p < data.length; p += 4) {
      data[p] = Math.min(255, Math.max(0, factor * (data[p] - 128) + 128));
      data[p + 1] = Math.min(255, Math.max(0, factor * (data[p + 1] - 128) + 128));
      data[p + 2] = Math.min(255, Math.max(0, factor * (data[p + 2] - 128) + 128));
    }
  },
};

/**
 * Example 2: Cornell Notes Lined Margin Marker
 * Draws soft horizontal ruled lines in margins for student hand notes.
 */
export const ruledMarginPlugin: FilterPlugin = {
  id: 'ruled-margin',
  name: 'Ruled Notes Margin',
  description: 'Draws subtle lined paper guides in the page margins for student notes',
  enabled: (settings: Settings) => (settings as any).cornellRuledLines === true,
  apply: (data: Uint8ClampedArray, width: number, height: number) => {
    // Draws light blue lines every 28 pixels across right margin
    const marginStartX = Math.floor(width * 0.7);
    for (let y = 40; y < height - 40; y += 28) {
      for (let x = marginStartX; x < width - 20; x++) {
        const p = (y * width + x) * 4;
        data[p] = 200;     // R
        data[p + 1] = 220; // G
        data[p + 2] = 245; // B (soft blue rule)
      }
    }
  },
};
