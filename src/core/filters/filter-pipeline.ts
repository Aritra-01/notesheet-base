/**
 * Extensible Filter Pipeline.
 * Allows custom plugins to register and hook into the pixel processing lifecycle.
 */

import { FilterPlugin, Settings } from '../types';
import { applyPixelFilters } from './pixel-filters';

class FilterPipelineManager {
  private plugins: FilterPlugin[] = [];

  /**
   * Register a custom filter plugin
   */
  public register(plugin: FilterPlugin): void {
    if (this.plugins.some((p) => p.id === plugin.id)) {
      console.warn(`FilterPlugin "${plugin.id}" is already registered. Skipping.`);
      return;
    }
    this.plugins.push(plugin);
  }

  /**
   * Unregister a custom filter plugin
   */
  public unregister(pluginId: string): void {
    this.plugins = this.plugins.filter((p) => p.id !== pluginId);
  }

  /**
   * Get all registered plugins
   */
  public getPlugins(): FilterPlugin[] {
    return [...this.plugins];
  }

  /**
   * Execute default pixel filters followed by all active custom plugins
   */
  public execute(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    settings: Settings
  ): Uint8ClampedArray {
    // 1. Core built-in filters (invert, smart invert, white background, clear bg, gray, bw)
    applyPixelFilters(data, width, height, settings);

    // 2. Custom registered plugins
    for (const plugin of this.plugins) {
      try {
        if (!plugin.enabled || plugin.enabled(settings)) {
          plugin.apply(data, width, height, settings);
        }
      } catch (err) {
        console.error(`Error in filter plugin "${plugin.id}":`, err);
      }
    }

    return data;
  }
}

export const filterPipeline = new FilterPipelineManager();
