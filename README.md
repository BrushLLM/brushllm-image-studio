<p align="center">
  <img src=".github/assets/icon.png" width="128" alt="BrushLLM Image Studio">
</p>

<h1 align="center">BrushLLM Image Studio</h1>

<p align="center">
  <a href="https://github.com/BrushLLM/brushllm-image-studio/releases"><img src="https://img.shields.io/github/v/release/BrushLLM/brushllm-image-studio?style=flat-square&color=orange" alt="Release"></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey?style=flat-square" alt="Platforms">
  <img src="https://img.shields.io/badge/UI-9%20languages-success?style=flat-square" alt="Languages">
</p>

<p align="center">
  <strong><a href="https://brushllm.com">🌐 brushllm.com</a></strong> · <a href="https://brushllm.com/docs">Docs</a> · <a href="https://github.com/BrushLLm/brushllm-image-studio/releases">Releases</a>
</p>

<p align="center">A local-first desktop image toolbox — 15 local tools run 100% on your device for free; 7 AI-powered edits call the BrushLLM gateway.</p>

<p align="center">
  <img src=".github/assets/screenshot.png" width="800" alt="BrushLLM Image Studio">
</p>

[English](README.md) | [Deutsch](docs/README.de.md) | [Español](docs/README.es.md) | [Français](docs/README.fr.md) | [Português (Brasil)](docs/README.pt-BR.md) | [日本語](docs/README.ja.md) | [简体中文](docs/README.zh-CN.md) | [繁體中文](docs/README.zh-TW.md) | [한국어](docs/README.ko.md)

---

## ✨ Features

- **Convert & compress** — batch-convert between 8 input and 8 output formats · quality presets with metadata stripping · same-format outputs never grow
- **Resize & crop** — pixels, percentage or presets (Lanczos resampling) · aspect-ratio frames, 90° rotation, flips with live preview
- **Retouch** — brightness / contrast / saturation · mosaic · drop shadow · rounded corners · text or image watermarks (tiled or positioned) · color replace for up to 6 pairs, shadows and texture preserved
- **Utilities** — EXIF view / edit / strip (lossless) · color picker (HEX/RGB one-click copy) · annotate (shapes, arrows, highlights, text) · stitch long image strips · mirror (A | A)
- **AI tools** — generate image · remove background · cutout · remove watermark · remove object · generative fill (with reference images) · restyle — cloud-powered via [brushllm.com](https://brushllm.com), billed per image
- **Also** — 9-language UI · dark mode · ⌘K command palette · batch processing · manual check-for-updates · zero telemetry

## 📥 Download

Grab the latest installer from [Releases](https://github.com/BrushLLm/brushllm-image-studio/releases):

| Platform | File |
| --- | --- |
| macOS — Apple Silicon (M-series) | `.dmg` (arm64) |
| Windows 10/11 — x64 (Intel/AMD) | `.exe` (x64) |
| Windows 10/11 — ARM64 (Snapdragon) | `.exe` (arm64) |

> **Apps are unsigned.** macOS: right-click the app → **Open** on first launch (Gatekeeper). Windows: choose **Run anyway** when SmartScreen appears — the installer opens with a 9-language selector.

## 🌐 UI Languages

**Available now (9):** English · Deutsch · Español · Français · Português (Brasil) · 简体中文 · 繁體中文 · 日本語 · 한국어

<details>
<summary><strong>🛠 Develop</strong></summary>

```bash
npm install
npm run tauri dev      # dev app window
npm run tauri build    # release bundle for the current machine
```

Rust engine tests: `cd src-tauri && cargo test` — requires Node 22+, Rust stable.

</details>

<details>
<summary><strong>🏗 Architecture</strong></summary>

- **UI** — React 19 + TypeScript + Vite in the system WebView (Tauri 2). `src/pages` (tool pages) → `src/components` → `src/lib/ipc.ts` (typed `invoke` wrappers).
- **Local engine** (`src-tauri/src/engine`) — a Rust image pipeline: `image` (JPEG/PNG/WebP/GIF/BMP/TIFF/ICO in), `resvg` (SVG in), `fast_image_resize` (SIMD Lanczos), `ravif` (AVIF out), `libwebp` (lossy WebP out), `kamadak-exif`. Input formats: 8 — JPEG, PNG, WebP, GIF (first frame), BMP, TIFF, ICO, SVG. Output formats: 8 — JPEG, PNG, WebP (lossy, quality slider), AVIF, SVG (embedded raster), TIFF, BMP, ICO.
- **Cloud** (`src-tauri/src/api/client.rs`) — the only code that talks to the BrushLLM gateway; separate base URLs for image edits and text-to-image; reference images sent as `image[]` parts (gpt-image models). The API key lives in the OS keychain, never in a plain file.
- **Update checks** — manual button in Settings; queries the GitHub releases API and opens the release page in the browser (no automatic downloads).

</details>

## ⚠️ Known limitations

- HEIC/HEIF and AVIF **input** are not supported (AVIF output works).
- WebP output is lossy (quality slider); SVG output embeds a raster image (not vector tracing); GIF inputs use the first frame.
- Apps are unsigned (code signing can be added to CI later).

---
