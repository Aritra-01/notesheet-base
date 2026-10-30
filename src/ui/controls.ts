/**
 * UI Component: Controls & Settings Panel (Presets, Switches, Dimensions, Advanced)
 */

import { PRESET_LAYOUTS } from '../core/config';
import { Orientation, PaperSize, QualityPreset, Settings } from '../core/types';
import { store } from './state';

export function initControls(elements: {
  presetsContainer: HTMLElement;
  customGridContainer: HTMLElement;
  rowsInput: HTMLInputElement;
  colsInput: HTMLInputElement;
  paperSelect: HTMLSelectElement;
  orientSelect: HTMLSelectElement;
  marginInput: HTMLInputElement;
  gapInput: HTMLInputElement;
  qualitySelect: HTMLSelectElement;
  invertSwitch: HTMLInputElement;
  whiteSwitch: HTMLInputElement;
  preserveSwitch: HTMLInputElement;
  clearSwitch: HTMLInputElement;
  graySwitch: HTMLInputElement;
  bwSwitch: HTMLInputElement;
  sepSwitch: HTMLInputElement;
  numSwitch: HTMLInputElement;
  numStartInput: HTMLInputElement;
}): void {
  const {
    presetsContainer,
    customGridContainer,
    rowsInput,
    colsInput,
    paperSelect,
    orientSelect,
    marginInput,
    gapInput,
    qualitySelect,
    invertSwitch,
    whiteSwitch,
    preserveSwitch,
    clearSwitch,
    graySwitch,
    bwSwitch,
    sepSwitch,
    numSwitch,
    numStartInput,
  } = elements;

  // Build Preset Layout buttons
  presetsContainer.innerHTML = '';
  PRESET_LAYOUTS.forEach((preset) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn-preset ${preset.badge ? 'badge-preset' : ''}`;
    btn.dataset.rows = String(preset.rows);
    btn.dataset.cols = String(preset.cols);
    btn.dataset.orient = preset.orientation;
    if (preset.badge) btn.dataset.badge = preset.badge;

    // Build mini grid visual
    let gridSlots = '';
    const totalSlots = preset.rows * preset.cols;
    for (let i = 0; i < totalSlots; i++) {
      gridSlots += '<i></i>';
    }

    btn.innerHTML = `
      <span class="mini-grid mini-${preset.orientation === 'landscape' ? 'land' : 'port'}" style="--r:${preset.rows};--c:${preset.cols}">
        ${gridSlots}
      </span>
      <b>${preset.label}</b>
    `;

    btn.addEventListener('click', () => {
      customGridContainer.hidden = true;
      store.saveSettings({
        rows: preset.rows,
        cols: preset.cols,
        orientation: preset.orientation,
        paper: store.getState().settings.paper === 'original' && preset.rows * preset.cols > 1 ? 'a4' : store.getState().settings.paper,
      });
    });

    presetsContainer.appendChild(btn);
  });

  // Custom button
  const customBtn = document.createElement('button');
  customBtn.type = 'button';
  customBtn.className = 'btn-preset';
  customBtn.dataset.custom = '1';
  customBtn.innerHTML = `
    <span class="mini-grid mini-custom">
      <svg viewBox="0 0 256 256" fill="currentColor" class="icon"><path d="M40,88H73a32,32,0,0,0,62,0h81a8,8,0,0,0,0-16H135a32,32,0,0,0-62,0H40a8,8,0,0,0,0,16Zm64-24A16,16,0,1,1,88,80,16,16,0,0,1,104,64ZM216,168H199a32,32,0,0,0-62,0H40a8,8,0,0,0,0,16h97a32,32,0,0,0,62,0h17a8,8,0,0,0,0-16Zm-48,24a16,16,0,1,1,16-16A16,16,0,0,1,168,192Z"/></svg>
    </span>
    <b>Custom</b>
  `;
  customBtn.addEventListener('click', () => {
    customGridContainer.hidden = false;
    highlightCustom();
  });
  presetsContainer.appendChild(customBtn);

  function highlightCustom() {
    presetsContainer.querySelectorAll('.btn-preset').forEach((b) => b.classList.remove('active'));
    customBtn.classList.add('active');
  }

  // Bind change events
  const onNumInput = (el: HTMLInputElement, key: keyof Settings, min = 1, max = 8) => {
    el.addEventListener('input', () => {
      const val = Math.min(max, Math.max(min, parseInt(el.value, 10) || min));
      store.saveSettings({ [key]: val });
    });
  };

  onNumInput(rowsInput, 'rows', 1, 8);
  onNumInput(colsInput, 'cols', 1, 8);

  paperSelect.addEventListener('change', () => {
    store.saveSettings({ paper: paperSelect.value as PaperSize });
  });

  orientSelect.addEventListener('change', () => {
    store.saveSettings({ orientation: orientSelect.value as Orientation });
  });

  marginInput.addEventListener('input', () => {
    const val = Math.min(40, Math.max(0, parseFloat(marginInput.value) || 0));
    store.saveSettings({ marginMm: val });
  });

  gapInput.addEventListener('input', () => {
    const val = Math.min(50, Math.max(0, parseFloat(gapInput.value) || 0));
    store.saveSettings({ gapMm: val });
  });

  qualitySelect.addEventListener('change', () => {
    store.saveSettings({ quality: qualitySelect.value as QualityPreset });
  });

  invertSwitch.addEventListener('change', () => {
    store.saveSettings({ invert: invertSwitch.checked });
  });

  whiteSwitch.addEventListener('change', () => {
    store.saveSettings({ whiteBackground: whiteSwitch.checked });
  });

  preserveSwitch.addEventListener('change', () => {
    store.saveSettings({ preserveImages: preserveSwitch.checked });
  });

  clearSwitch.addEventListener('change', () => {
    store.saveSettings({ clearBackground: clearSwitch.checked });
  });

  graySwitch.addEventListener('change', () => {
    if (graySwitch.checked) bwSwitch.checked = false;
    store.saveSettings({ grayscale: graySwitch.checked, blackWhite: bwSwitch.checked });
  });

  bwSwitch.addEventListener('change', () => {
    if (bwSwitch.checked) graySwitch.checked = false;
    store.saveSettings({ blackWhite: bwSwitch.checked, grayscale: graySwitch.checked });
  });

  sepSwitch.addEventListener('change', () => {
    store.saveSettings({ separators: sepSwitch.checked });
  });

  numSwitch.addEventListener('change', () => {
    store.saveSettings({ pageNumbers: numSwitch.checked });
  });

  numStartInput.addEventListener('input', () => {
    const val = Math.max(0, parseInt(numStartInput.value, 10) || 1);
    store.saveSettings({ pageNumberStart: val });
  });

  // Keep controls synchronized with store state
  store.subscribe((state) => {
    const s = state.settings;

    rowsInput.value = String(s.rows);
    colsInput.value = String(s.cols);
    paperSelect.value = s.paper;
    orientSelect.value = s.orientation;
    marginInput.value = String(s.marginMm);
    gapInput.value = String(s.gapMm);
    qualitySelect.value = s.quality;

    invertSwitch.checked = s.invert;
    whiteSwitch.checked = s.whiteBackground;
    preserveSwitch.checked = s.preserveImages;
    clearSwitch.checked = s.clearBackground;
    graySwitch.checked = s.grayscale;
    bwSwitch.checked = s.blackWhite;
    sepSwitch.checked = s.separators;
    numSwitch.checked = s.pageNumbers;
    numStartInput.value = String(s.pageNumberStart);

    // Disable dependent controls appropriately
    whiteSwitch.closest('.switch-item')?.classList.toggle('disabled', !s.invert);
    preserveSwitch.closest('.switch-item')?.classList.toggle('disabled', !s.invert);
    numStartInput.closest('.field-row')?.classList.toggle('disabled', !s.pageNumbers);
    gapInput.closest('.field-row')?.classList.toggle('disabled', s.rows * s.cols === 1);

    // Sync active preset button
    let matched = false;
    presetsContainer.querySelectorAll('.btn-preset:not([data-custom])').forEach((el) => {
      const b = el as HTMLButtonElement;
      const match =
        parseInt(b.dataset.rows || '0', 10) === s.rows &&
        parseInt(b.dataset.cols || '0', 10) === s.cols &&
        b.dataset.orient === s.orientation;
      b.classList.toggle('active', match);
      if (match) matched = true;
    });

    customBtn.classList.toggle('active', !matched);
    customGridContainer.hidden = matched;
  });
}
