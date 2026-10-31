# ⚡ NoteSheet — Dark Slides to Print-Ready Sheets

<div align="center">

![NoteSheet Banner](assets/banner.png#gh-light-mode-only)
![NoteSheet Banner](assets/banner-dark.png#gh-dark-mode-only)

### Transform dark lecture slides & blackboard PDFs into beautiful, print-ready white sheets — right in your browser. 100% private, zero uploads.

[![MIT License](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6-646cff.svg)](https://vitejs.dev/)
[![PDF-Lib](https://img.shields.io/badge/PDF--Lib-1.x-green.svg)](https://pdf-lib.js.org/)
[![PDF.js](https://img.shields.io/badge/PDF.js-4-ff6600.svg)](https://mozilla.github.io/pdf.js/)
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)](#)
[![npm version](https://img.shields.io/badge/npm-v10-blueviolet.svg)](https://www.npmjs.com/)
[![GitHub stars](https://img.shields.io/github/stars/Aritra-01/notesheet-base?style=social)](https://github.com/Aritra-01/notesheet-base/stargazers)

**English** · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

> ⚡ Fast, powerful, and completely private — all processing happens locally in your browser.

</div>

---

## 🎯 What Does NoteSheet Do?

| 📷 Before (Dark Slide) | 📄 After (Print-Ready) |
|:----------------------:|:----------------------:|
| ![Before](assets/before-slide.png) | ![After](assets/after-sheet.png) |

Upload any dark-themed PDF — lecture slides with black backgrounds, whiteboard photos, tablet captures, scanned blackboard notes — and NoteSheet inverts them to **crisp white pages** ready for printing. Pack **1, 2, 3, 4, 6, or 8 slides per sheet** with full N-up layout control. Or fold output into a **saddle-stitch booklet/zine** for physical book binding.

---

## ✨ Features

### 🔄 Intelligent Color Inversion
- **Standard Invert** — flips dark backgrounds to white, preserving text clarity
- **Pure White Background** — adaptive 4-bit per channel histogram analysis detects navy, slate, or blackboard-green and calculates Color Dodge tables to eliminate cream/muddy tints
- **Smart Invert for Screenshots** — cellular grid median brightness + connected-component flood fills distinguish slide backgrounds from light textbook diagrams and screenshots, keeping diagrams perfectly readable
- **Clear Background** — deepens text while whitening faint paper noise, scanning artifacts, and background gradients
- **Grayscale** — non-linear tone curve saves expensive colored printer ink
- **Black & White (Monochrome)** — Bradley adaptive thresholding with 2D integral image (summed-area table) for razor-sharp 2-tone laser printing

### 📑 N-up Sheet Layout Engine
| Layouts | Papers | Orientation |
|---------|--------|-------------|
| **1, 2, 3 (Best for lectures), 4 (2×2), 6 (3×2), 8 (4×2)** or **Custom** | **A4, A5, A3, US Letter, US Legal, Original** | **Portrait** or **Landscape** |
- Customizable margins & inter-slide gaps (in mm)
- Optional separator cut lines and automated page numbering
- Live preview updates instantly as you adjust settings

### 📖 Saddle-Stitch Booklet Imposition
Fold your output into a physical **book/zine** for saddle-stitch printing:
- Rearranges pages so they fold in half in proper book order
- **Half-page logical numbering** — each half-page has its own book page number
- **Center fold dashed guideline** — guides you to fold or cut precisely in half
- **Spine creep gutter shift** — compensates for paper thickness in thicker booklets
- Supports both **vector** and **raster** pipeline modes

### 🔀 Multi-File Merger & Page Filtering
- Drag-and-drop multiple PDF files
- Visual thumbnail grid with lazy rendering
- Reorder via drag or arrow buttons
- Quick selection toggles: **All / None / Flip**
- Range removal parser: `1, 4-6, 12` or `1-3, 7, 10-12`

### 🛡️ 100% Client-Side Privacy
- **Zero server uploads** — all processing happens in your browser
- Files never leave your device
- No analytics, no telemetry, no tracking

### ⚡ Dual Pipeline Architecture
| Pipeline | When It's Used | Advantages |
|----------|---------------|------------|
| **🚀 Vector Pipeline** | Standard color inversion only | 100% lossless, crystal-clear text, tiny file sizes, millisecond processing |
| **🎨 Raster Pipeline** | Smart invert, clear background, grayscale, B&W, or screenshot preservation | High-precision pixel processing, Web Worker threading keeps UI at 60fps |

### 👁️ Interactive Live Preview
- **Instant canvas preview** of the first output sheet with exact margins, spacing, and active filters
- **Dynamic paper savings counter** (e.g. *244 slides → 61 sheets · Saves 183 sheets*)
- **Pipeline mode badge** shows Vector or Raster mode
- **Booklet preview** shows correct saddle-stitch page arrangement

### 📤 Export & Share
- Direct PDF download with generated file size
- Non-blocking processing with `AbortController` cancellation
- Native **Web Share API** integration on supported devices
- Progress bar with cancel button

---

## 🚀 Quick Start

### Install & Run

```bash
# Clone the repository
git clone https://github.com/Aritra-01/notesheet-base.git
cd notesheet-base

# Install dependencies
pnpm install
# or: npm install

# Start development server
pnpm dev
# Open http://localhost:3000 in your browser

# Run tests
pnpm test

# Build for production
pnpm build
# Output in dist/ — ready to deploy to Vercel, Netlify, Cloudflare Pages, or GitHub Pages
```

### Or: Use the Live Demo

> The live version is available at: **[notesheet-base.vercel.app](https://notesheet-base.vercel.app)** *(or deploy your own from `dist/`)*

---

## 🗂️ Project Structure

```
notesheet-base/
├── index.html                        # Clean, responsive web app shell
├── package.json                      # Scripts: dev, build, preview, test
├── tsconfig.json                     # Strict TypeScript config
├── vite.config.ts                    # Vite with worker bundling
├── test/
│   └── engine.test.ts               # Core algorithm tests (tsx)
├── src/
│   ├── main.ts                      # App bootstrap and glue
│   ├── core/
│   │   ├── types.ts                 # TypeScript interfaces
│   │   ├── config.ts                # Defaults, paper sizes, presets
│   │   ├── filters/                 # Pixel filter pipeline
│   │   │   ├── pixel-filters.ts    # Invert, pure white, smart invert, etc.
│   │   │   ├── filter-pipeline.ts  # Extensible plugin manager
│   │   │   ├── filter-worker.ts    # Web Worker for threading
│   │   │   └── worker-client.ts    # Main-thread bridge
│   │   ├── engine/
│   │   │   ├── layout-math.ts      # Sheet geometry, N-up tiling
│   │   │   ├── booklet-math.ts     # Saddle-stitch page pairing
│   │   │   ├── booklet-pipeline.ts # Booklet rendering
│   │   │   ├── pdf-merger.ts       # Multi-file concatenation
│   │   │   ├── pdfjs-wrapper.ts    # PDF.js renderer
│   │   │   ├── vector-pipeline.ts  # Lossless vector invert
│   │   │   ├── raster-pipeline.ts  # Canvas + pixel pipeline
│   │   │   └── processor.ts        # Vector vs raster router
│   │   └── preview/
│   │       └── preview-renderer.ts # Live canvas preview
│   ├── ui/
│   │   ├── state.ts                 # Reactive state store
│   │   ├── icons.ts                 # SVG icons
│   │   ├── file-list.ts             # Multi-file list
│   │   ├── page-grid.ts            # Thumbnail grid & range parser
│   │   ├── controls.ts             # Presets, switches, inputs
│   │   ├── preview-card.ts         # Preview card & stats
│   │   └── export-modal.ts         # Progress, download, share
│   ├── plugins/
│   │   └── custom-filter-sample.ts # Template for custom filters
│   └── styles/
│       ├── variables.css           # Theme tokens (CSS variables)
│       ├── main.css                # Base layout & typography
│       └── components.css          # Dropzone, cards, switches
└── assets/                         # README images (screenshots, banners)
```

---

## 🎨 Customization Guide

### Adding a Custom Pixel Filter

```typescript
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
      data[i]     = Math.min(255, Math.max(0, (data[i] - 128) * factor + 128));
      data[i + 1] = Math.min(255, Math.max(0, (data[i + 1] - 128) * factor + 128));
      data[i + 2] = Math.min(255, Math.max(0, (data[i + 2] - 128) * factor + 128));
    }
  },
};

filterPipeline.register(contrastBooster);
```

### Adding a New Layout Preset

```typescript
// src/core/config.ts
export const PRESET_LAYOUTS: PresetLayout[] = [
  // ...existing presets...
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

### Custom Paper Sizes

```typescript
// src/core/config.ts
export const PAPER_SIZES_PT: Record<string, [number, number]> = {
  // Add custom sizes (1 mm = 72/25.4 pt)
  b5: [498.9, 708.7], // Japanese B5
};
```

---

## 🔒 Security & Performance

| Feature | Implementation |
|---------|---------------|
| **Zero network requests** | No PDFs or analytics uploaded |
| **Web Worker threading** | Bitmap processing off main thread |
| **Memory safety** | Canvas clamped to 4096px max |
| **AbortController** | Cancel any operation instantly |

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## 📜 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- Inspired by [NoteSheet](https://notes-sheet-3e504.web.app/)
- Built with [Vite 6](https://vitejs.dev/), [TypeScript](https://www.typescriptlang.org/), [PDF-Lib](https://pdf-lib.js.org/), and [PDF.js](https://mozilla.github.io/pdf.js/)
- **Aritra-01** — [GitHub Profile](https://github.com/Aritra-01)

---

<div align="center">

**⭐ Star this repo if you find it useful!**

*Made with ❤️ for students, researchers, and anyone who prints lecture slides*

</div>
