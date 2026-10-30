/**
 * High-performance pixel filters for rendered PDF pages.
 * Works on raw Uint8ClampedArray (RGBA) pixels.
 * Usable on both main thread and inside Web Workers.
 */

import { DominantColorResult, Settings } from '../types';

// Precomputed lookup tables
export const INVERT_LUT = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  INVERT_LUT[i] = 255 - i;
}

// Ink-saving grayscale curve: near-white becomes pure white, mid tones darkened slightly
export const GRAY_CURVE = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  GRAY_CURVE[i] = i > 238 ? 255 : Math.round(225 * Math.pow(i / 238, 1.5));
}

// Brightening gamma applied before adaptive thresholding
export const PRE_THRESHOLD = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  PRE_THRESHOLD[i] = Math.round(255 * Math.pow(i / 255, 0.6));
}

export function luma(r: number, g: number, b: number): number {
  return (r * 77 + g * 150 + b * 29) >> 8;
}

/**
 * Finds dominant colour inside a rectangle using a 4-bit/channel histogram (4096 bins).
 */
export function dominantColor(
  width: number,
  height: number,
  data: Uint8ClampedArray,
  rect = { x: 0, y: 0, w: width, h: height }
): DominantColorResult | null {
  const area = rect.w * rect.h;
  if (!area) return null;

  const step = Math.max(1, Math.round(Math.sqrt(area / 40000)));
  const counts = new Uint32Array(4096);
  const sums = new Float64Array(4096 * 3);
  let samples = 0;

  for (let y = rect.y; y < rect.y + rect.h; y += step) {
    for (let x = rect.x; x < rect.x + rect.w; x += step) {
      const p = (y * width + x) * 4;
      const r = data[p], g = data[p + 1], b = data[p + 2];
      const bin = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      counts[bin]++;
      sums[bin * 3] += r;
      sums[bin * 3 + 1] += g;
      sums[bin * 3 + 2] += b;
      samples++;
    }
  }

  let best = 0;
  for (let k = 1; k < 4096; k++) {
    if (counts[k] > counts[best]) best = k;
  }

  const n = counts[best];
  if (samples === 0) return null;

  return {
    color: [sums[best * 3] / n, sums[best * 3 + 1] / n, sums[best * 3 + 2] / n],
    share: n / samples,
  };
}

/**
 * Dominant colour of a dark background, or null if page is already light or lacks clear background.
 */
export function detectBackground(
  width: number,
  height: number,
  data: Uint8ClampedArray,
  rect?: { x: 0; y: 0; w: number; h: number }
): [number, number, number] | null {
  const d = dominantColor(width, height, data, rect);
  if (!d || d.share < 0.2) return null;
  return luma(d.color[0], d.color[1], d.color[2]) <= 110 ? d.color : null;
}

/**
 * Calculates per-channel strength (0..1) for a "color dodge" mapping inverted dark background to pure white.
 */
export function whitePointStrength(bg: [number, number, number]): [number, number, number] {
  return [
    Math.min(200, bg[0] + 10) / 255,
    Math.min(200, bg[1] + 10) / 255,
    Math.min(200, bg[2] + 10) / 255,
  ];
}

export function dodgeTables(strength: [number, number, number]): [Uint8Array, Uint8Array, Uint8Array] {
  const tables = strength.map((s) => {
    const t = new Uint8Array(256);
    const denom = Math.max(0.001, 1 - s);
    for (let v = 0; v < 256; v++) {
      t[v] = Math.min(255, Math.round(v / denom));
    }
    return t;
  });
  return [tables[0], tables[1], tables[2]];
}

const DARK_CELL = 110;
const LIGHT_PIXEL = 128;
const UNKNOWN = 255;

/**
 * Smart invert algorithm: analyzes page structure to preserve embedded light screenshots and diagrams.
 * Returns a label array: 0 = keep as is, k > 0 = invert (k identifies dark region for area dodge).
 */
export function smartInvertLabels(width: number, height: number, data: Uint8ClampedArray): Uint8Array {
  const cs = Math.max(6, Math.round(width / 160));
  const GW = Math.ceil(width / cs);
  const GH = Math.ceil(height / cs);
  const N = GW * GH;
  const pixelLuma = (i: number) => luma(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);

  // 1. Background tone per cell
  const dark = new Uint8Array(N);
  const samples = new Uint8Array(64);
  for (let gy = 0; gy < GH; gy++) {
    const y0 = gy * cs;
    const y1 = Math.min(height, y0 + cs);
    const sy = Math.max(1, ((y1 - y0) / 8) | 0);
    for (let gx = 0; gx < GW; gx++) {
      const x0 = gx * cs;
      const x1 = Math.min(width, x0 + cs);
      const sx = Math.max(1, ((x1 - x0) / 8) | 0);
      let n = 0;
      for (let y = y0; y < y1 && n < 64; y += sy) {
        for (let x = x0; x < x1 && n < 64; x += sx) {
          samples[n++] = pixelLuma(y * width + x);
        }
      }
      const sorted = samples.subarray(0, n).sort();
      dark[gy * GW + gx] = sorted[n >> 1] < DARK_CELL ? 1 : 0;
    }
  }

  // 2. Connected areas; small ones adopt surrounding tone
  const stack = new Int32Array(N);
  const floodCells = (start: number, seen: Uint8Array, visit: (cell: number) => void) => {
    const tone = dark[start];
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    while (top) {
      const c = stack[--top];
      visit(c);
      const x = c % GW;
      const nbrs = [
        x > 0 ? c - 1 : -1,
        x < GW - 1 ? c + 1 : -1,
        c >= GW ? c - GW : -1,
        c < N - GW ? c + GW : -1,
      ];
      for (const nb of nbrs) {
        if (nb >= 0 && !seen[nb] && dark[nb] === tone) {
          seen[nb] = 1;
          stack[top++] = nb;
        }
      }
    }
  };

  const minCells = Math.max(4, Math.round(N * 0.01));
  const seen = new Uint8Array(N);
  const flip: number[][] = [];
  for (let c = 0; c < N; c++) {
    if (seen[c]) continue;
    const cells: number[] = [];
    floodCells(c, seen, (cell) => cells.push(cell));
    if (cells.length < minCells) flip.push(cells);
  }
  for (const cells of flip) {
    for (const c of cells) dark[c] ^= 1;
  }

  const area = new Uint8Array(N);
  seen.fill(0);
  let areas = 0;
  for (let c = 0; c < N; c++) {
    if (seen[c] || !dark[c]) continue;
    const id = Math.min(254, ++areas);
    floodCells(c, seen, (cell) => {
      area[cell] = id;
    });
  }

  // 3. Per-pixel labels
  const label = new Uint8Array(width * height);
  let unknown = 0;
  for (let gy = 0; gy < GH; gy++) {
    for (let gx = 0; gx < GW; gx++) {
      const c = gy * GW + gx;
      let border = false;
      for (let dy = -1; dy <= 1 && !border; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = gx + dx, ny = gy + dy;
          if (nx >= 0 && ny >= 0 && nx < GW && ny < GH && dark[ny * GW + nx] !== dark[c]) {
            border = true;
            break;
          }
        }
      }
      const value = border ? UNKNOWN : area[c];
      const x1 = Math.min(width, (gx + 1) * cs);
      const y1 = Math.min(height, (gy + 1) * cs);
      for (let y = gy * cs; y < y1; y++) {
        label.fill(value, y * width + gx * cs, y * width + x1);
      }
      if (border) unknown += (x1 - gx * cs) * (y1 - gy * cs);
    }
  }

  if (!unknown) return label;

  const queue = new Int32Array(unknown * 2);
  let head = 0, tail = 0;
  const grow = (matchTone: boolean) => {
    const accepts = (i: number, from: number) =>
      !matchTone || (label[from] === 0) === (pixelLuma(i) >= LIGHT_PIXEL);

    const tryNeighbours = (i: number) => {
      const x = i % width;
      const nbrs = [
        x > 0 ? i - 1 : -1,
        x < width - 1 ? i + 1 : -1,
        i >= width ? i - width : -1,
        i < label.length - width ? i + width : -1,
      ];
      for (const j of nbrs) {
        if (j >= 0 && label[j] === UNKNOWN && accepts(j, i)) {
          label[j] = label[i];
          queue[tail++] = j;
        }
      }
    };

    for (let i = 0; i < label.length; i++) {
      if (label[i] !== UNKNOWN) continue;
      const x = i % width;
      const nbrs = [
        x > 0 ? i - 1 : -1,
        x < width - 1 ? i + 1 : -1,
        i >= width ? i - width : -1,
        i < label.length - width ? i + width : -1,
      ];
      for (const j of nbrs) {
        if (j >= 0 && label[j] !== UNKNOWN && accepts(i, j)) {
          label[i] = label[j];
          queue[tail++] = i;
          break;
        }
      }
    }

    while (head < tail) tryNeighbours(queue[head++]);
  };

  grow(true);
  grow(false);

  for (let i = 0; i < label.length; i++) {
    if (label[i] === UNKNOWN) {
      const c = ((((i / width) | 0) / cs) | 0) * GW + (((i % width) / cs) | 0);
      label[i] = area[c];
    }
  }

  return label;
}

/**
 * Calculates white-point color dodge tables per dark region.
 */
export function areaDodges(
  width: number,
  height: number,
  data: Uint8ClampedArray,
  label: Uint8Array
): Array<[Uint8Array, Uint8Array, Uint8Array] | null> {
  const hist = new Map<number, { counts: Uint32Array; sums: Float64Array; n: number }>();
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = y * width + x;
      const k = label[i];
      if (!k) continue;
      let h = hist.get(k);
      if (!h) {
        h = { counts: new Uint32Array(4096), sums: new Float64Array(4096 * 3), n: 0 };
        hist.set(k, h);
      }
      const p = i * 4;
      const r = data[p], g = data[p + 1], b = data[p + 2];
      const bin = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      h.counts[bin]++;
      h.n++;
      h.sums[bin * 3] += r;
      h.sums[bin * 3 + 1] += g;
      h.sums[bin * 3 + 2] += b;
    }
  }

  const dodges: Array<[Uint8Array, Uint8Array, Uint8Array] | null> = [];
  for (const [k, h] of hist) {
    let best = 0;
    for (let b = 1; b < 4096; b++) {
      if (h.counts[b] > h.counts[best]) best = b;
    }
    const n = h.counts[best];
    const bg: [number, number, number] = [
      h.sums[best * 3] / n,
      h.sums[best * 3 + 1] / n,
      h.sums[best * 3 + 2] / n,
    ];
    dodges[k] =
      n / h.n >= 0.2 && luma(bg[0], bg[1], bg[2]) <= 110
        ? dodgeTables(whitePointStrength(bg))
        : null;
  }
  return dodges;
}

/**
 * Bradley adaptive threshold using a 2D integral image for sharp, pure 2-tone monochrome.
 */
export function adaptiveThreshold(
  width: number,
  height: number,
  data: Uint8ClampedArray,
  windowSize = 34,
  offset = 10
): void {
  const n = width * height;
  const gray = new Uint8Array(n);
  for (let p = 0, i = 0; p < data.length; p += 4, i++) {
    gray[i] = PRE_THRESHOLD[luma(data[p], data[p + 1], data[p + 2])];
  }

  const integral = new Uint32Array(n);
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    const row = y * width;
    for (let x = 0; x < width; x++) {
      rowSum += gray[row + x];
      integral[row + x] = (y ? integral[row - width + x] : 0) + rowSum;
    }
  }

  const half = windowSize >> 1;
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - half);
    const y1 = Math.min(height - 1, y + half);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - half);
      const x1 = Math.min(width - 1, x + half);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      let sum = integral[y1 * width + x1];
      if (x0 > 0) sum -= integral[y1 * width + x0 - 1];
      if (y0 > 0) sum -= integral[(y0 - 1) * width + x1];
      if (x0 > 0 && y0 > 0) sum += integral[(y0 - 1) * width + x0 - 1];

      const i = y * width + x;
      const v = gray[i] < sum / area - offset ? 0 : 255;
      const p = i * 4;
      data[p] = data[p + 1] = data[p + 2] = v;
    }
  }
}

/**
 * Applies all active pixel filters in-place to RGBA pixel buffer.
 */
export function applyPixelFilters(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  opts: Partial<Settings>
): Uint8ClampedArray {
  const { invert, whiteBackground, preserveImages, clearBackground, grayscale, blackWhite } = opts;

  if (!invert && !clearBackground && !grayscale && !blackWhite) {
    return data;
  }

  let labels: Uint8Array | null = null;
  let dodges: Array<[Uint8Array, Uint8Array, Uint8Array] | null> = [];
  let pageDodge: [Uint8Array, Uint8Array, Uint8Array] | null = null;

  if (invert && preserveImages) {
    labels = smartInvertLabels(width, height, data);
    if (whiteBackground) {
      dodges = areaDodges(width, height, data, labels);
    }
  } else if (invert && whiteBackground) {
    const bg = detectBackground(width, height, data);
    pageDodge = bg ? dodgeTables(whitePointStrength(bg)) : null;
  }

  for (let i = 0, p = 0; i < width * height; i++, p += 4) {
    let r = data[p], g = data[p + 1], b = data[p + 2];

    if (invert) {
      const k = labels ? labels[i] : 1;
      if (k) {
        r = INVERT_LUT[r];
        g = INVERT_LUT[g];
        b = INVERT_LUT[b];
        const dodge = labels ? dodges[k] : pageDodge;
        if (dodge) {
          r = dodge[0][r];
          g = dodge[1][g];
          b = dodge[2][b];
        }
      }
    }

    if (clearBackground) {
      const l = luma(r, g, b);
      if (l > 215) {
        r = g = b = 255;
      } else {
        const k = (Math.pow(l / 215, 1.35) * 215) / Math.max(1, l);
        r = Math.min(255, r * k);
        g = Math.min(255, g * k);
        b = Math.min(255, b * k);
      }
    }

    if (grayscale && !blackWhite) {
      r = g = b = GRAY_CURVE[luma(r, g, b)];
    }

    data[p] = r;
    data[p + 1] = g;
    data[p + 2] = b;
  }

  if (blackWhite) {
    adaptiveThreshold(width, height, data);
  }

  return data;
}
