# ⚡ NoteSheet Base

> A fully customizable, high-performance in-browser PDF engine that turns dark lecture slides, blackboard notes, and tablet recordings into crisp, print-ready sheets. Merge multiple PDFs, invert blackboard colors to white paper, protect embedded screenshots, and pack 2, 3, 4, 6, or 8 slides per page.

Inspired by [NoteSheet](https://notes-sheet-3e504.web.app/), built with **Vite 6**, **TypeScript**, **PDF-Lib**, and **PDF.js**.

---

## 🌟 Key Features

- **100% Client-Side Privacy**: Runs completely in the user's browser. Files are never uploaded to any server.
- **Dual Pipeline Architecture**:
  - **Vector Pipeline**: When only standard color inversion is needed, operations use PDF blend modes (`BlendMode.Difference` + `BlendMode.ColorDodge`). Vector text and fonts remain 100% lossless, crystal-clear, and produce tiny file sizes in milliseconds.
  - **Raster Pipeline**: When smart screenshot preservation, clear background, grayscale, or adaptive B&W thresholding is enabled, pages render via PDF.js to an OffscreenCanvas and process through a dedicated multi-threaded **Web Worker** so the UI stays silky smooth at 60fps.
- **Intelligent Color Filters**:
  - **Invert Colors**: Flips dark blackboard/tablet backgrounds to clean white paper.
  - **Pure White Background**: Samples 4-bit per channel histogram (4,096 bins) to detect dark navy, slate, or blackboard green backgrounds, then calculates per-channel Color Dodge tables to eliminate cream or muddy tints.
  - **Smart Invert for Pasted Screenshots**: Uses cellular grid median brightness and connected-component flood fills to distinguish dark slide backgrounds from light textbook diagrams and screenshots, keeping diagrams readable.
  - **Clear Background**: Deepens text while whitening faint paper noise, scanning artifacts, and background gradients.
  - **Grayscale**: Applies a non-linear tone curve that saves expensive colored printer ink.
  - **Black & White (Monochrome)**: Bradley adaptive thresholding with a 2D integral image (summed-area table) for razor-sharp 2-tone laser printing.
- **N-up Sheet Layout Engine**:
  - Presets: **1**, **2**, **3 (Best for lecture slides)**, **4 (2×2)**, **6 (3×2)**, **8 (4×2)**, or **Custom (Rows × Cols)**.
  - Paper Sizes: **A4**, **A5**, **A3**, **US Letter**, **US Legal**, or **Original**.
  - Orientation: **Portrait** or **Landscape**.
  - Customizable Margins & Inter-slide Gaps (in mm).
  - Optional separator divider lines and automated page numbering.
- **Multi-File Merger & Page Filtering**:
  - Drag-and-drop file upload, reordering (drag or arrow buttons), and removal.
  - Visual thumbnail grid with `IntersectionObserver` lazy rendering.
  - Quick selection toggles: *All*, *None*, *Flip*.
  - Range removal parser (e.g. `1, 4-6, 12`).
- **Interactive Live Preview**:
  - Instant live rendering of the first output sheet showing exact margins, spacing, and active color filters.
  - Dynamic paper savings counter (e.g. *99 slides → 33 sheets · Saves 66 sheets*).
  - Pipeline indicator badge (*Vector Mode* vs *Raster Mode*).
- **Progress & Sharing**:
  - Non-blocking processing with `AbortController` cancellation.
  - Direct PDF download with generated file size.
  - Native Web Share API integration on supported devices.

---

## 📁 Repository Structure

```
notesheet-base/
├── index.html                   # Clean, responsive web application shell
├── package.json                 # Scripts: dev, build, preview, test
├── tsconfig.json                # Strict TypeScript configuration
├── vite.config.ts               # Vite configuration with worker bundling
├── test/
│   └── engine.test.ts           # Automated test suite for core algorithms
├── src/
│   ├── main.ts                  # Application bootstrap and glue logic
│   ├── core/
│   │   ├── types.ts             # Strong TypeScript interfaces & data contracts
│   │   ├── config.ts            # Default presets, paper sizes, quality settings
│   │   ├── filters/
│   │   │   ├── pixel-filters.ts # Invert, pure white, smart invert, clear bg, grayscale, B&W
│   │   │   ├── filter-pipeline.ts # Extensible plugin manager for custom filters
│   │   │   ├── filter-worker.ts # Web Worker for parallel multi-threaded crunching
│   │   │   └── worker-client.ts # Main-thread bridge with automatic fallback
│   │   ├── engine/
│   │   │   ├── layout-math.ts   # Sheet geometry, N-up tiling, margins, gaps, separators
│   │   │   ├── pdf-merger.ts    # Multi-file PDF concatenation
│   │   │   ├── pdfjs-wrapper.ts # PDF.js canvas renderer wrapper
│   │   │   ├── vector-pipeline.ts # Lossless vector difference + color dodge pipeline
│   │   │   ├── raster-pipeline.ts # Canvas render + pixel filter + PDF-lib embed pipeline
│   │   │   └── processor.ts     # Main orchestrator routing vector vs raster
│   │   └── preview/
│   │       └── preview-renderer.ts # Live sheet canvas preview renderer with debouncing
│   ├── ui/
│   │   ├── state.ts             # Central reactive state store
│   │   ├── icons.ts             # Clean SVG icons
│   │   ├── file-list.ts         # Multi-file list with drag reordering & deletion
│   │   ├── page-grid.ts         # Visual page thumbnails grid & range removal
│   │   ├── controls.ts          # Presets, switches, layout inputs, and options
│   │   ├── preview-card.ts      # Live canvas preview card, stats & pipeline badge
│   │   └── export-modal.ts      # Progress bar, cancel button, download & share
│   ├── plugins/
│   │   └── custom-filter-sample.ts # Ready-to-use template for adding custom filters
│   └── styles/
│       ├── variables.css        # Theme tokens (colors, light/dark mode, radii, shadows)
│       ├── main.css             # Base layout, reset, typography, responsive breakpoints
│       └── components.css       # Dropzone, cards, switches, preset buttons, thumbnails
└── README.md
```

---

## 🚀 Quick Start

### 1. Install dependencies
```bash
pnpm install
# or: npm install
```

### 2. Start local development server
```bash
pnpm dev
# or: npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 3. Run automated tests
```bash
pnpm test
# or: npm test
```

### 4. Build for production
```bash
pnpm build
# or: npm run build
```
The optimized static build outputs to `dist/`, ready to deploy to Vercel, Netlify, Cloudflare Pages, GitHub Pages, or Firebase Hosting.

---

## 🛠️ Customization Guide

This repository was architected specifically so you can easily modify existing features or add new ones.

### 1. Adding a Custom Pixel Filter

Want to add a custom image filter (e.g. Contrast Booster, Warm Sepia tone, or Ruled Margin Lines for student handwriting)?

Register your custom plugin with `filterPipeline` in `src/core/filters/filter-pipeline.ts` or in `src/plugins/`:

```ts
import { filterPipeline } from './core/filters/filter-pipeline';
import { FilterPlugin, Settings } from './core/types';

export const contrastBooster: FilterPlugin = {
  id: 'contrast-booster',
  name: 'Contrast Booster',
  description: 'Deepens light pencil or chalk marks',
  enabled: (settings: Settings) => true,
  apply: (data: Uint8ClampedArray, width: number, height: number, settings: Settings) => {
    const factor = 1.25; // 25% contrast boost
    for (let i = 0; i < data.length; i += 4) {
      data[i]     = Math.min(255, Math.max(0, (data[i] - 128) * factor + 128));     // R
      data[i + 1] = Math.min(255, Math.max(0, (data[i + 1] - 128) * factor + 128)); // G
      data[i + 2] = Math.min(255, Math.max(0, (data[i + 2] - 128) * factor + 128)); // B
    }
  },
};

// Register in your app
filterPipeline.register(contrastBooster);
```

### 2. Adding a New Layout Preset

Open `src/core/config.ts` and add your layout to `PRESET_LAYOUTS`:

```ts
export const PRESET_LAYOUTS: PresetLayout[] = [
  // ... existing presets ...
  {
    id: 'cornell-2up',
    label: 'Cornell (2+Notes)',
    rows: 2,
    cols: 1,
    orientation: 'portrait',
    badge: 'Study'
  },
];
```

### 3. Customizing Paper Sizes

Open `src/core/config.ts` and define new paper dimensions in PDF points (1 mm = 72 / 25.4 pt):

```ts
export const PAPER_SIZES_PT: Record<string, [number, number]> = {
  // ...
  b5: [498.9, 708.7], // Japanese B5 size
};
```

### 4. Customizing Themes & Colors

Open `src/styles/variables.css`. All colors, radii, and shadows use CSS variables:
- `--accent`: Highlighter yellow accent color.
- `--bg` & `--surface`: Background and card colors.
- `--r-panel` & `--r-control`: Border radius curvature.

---

## 🔒 Security & Performance

- **Zero network requests**: No PDFs or analytics telemetry are uploaded.
- **Web Worker threading**: Heavy bitmap and adaptive threshold processing runs off the main thread.
- **Memory safety**: Offscreen canvas dimensions are clamped to `MAX_CANVAS_SIDE` (4096px) to prevent mobile browser memory exhaustion.

---

## 📄 License

MIT License — Feel free to use, modify, and build upon this base repository for personal, educational, or commercial projects!
