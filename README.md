<img src="src/assets/image-studio.svg" width="88" height="88" alt="">

# BrushLLM Image Studio

Edit images on macOS and Windows. Local tools run on your device for free and require no account.

**[Download the latest release](https://github.com/BrushLLM/brushllm-image-studio/releases/latest)** · [Product page](https://brushllm.com/studio/)

[English](README.md) · [Deutsch](docs/README.de.md) · [Español](docs/README.es.md) · [Français](docs/README.fr.md) · [Português (Brasil)](docs/README.pt-BR.md) · [日本語](docs/README.ja.md) · [한국어](docs/README.ko.md) · [简体中文](docs/README.zh-CN.md) · [繁體中文](docs/README.zh-TW.md)

![Image Studio showing image import and the local tools directory](.github/assets/workspace.svg)

## Download

| System | Installer |
| --- | --- |
| macOS on Apple Silicon | `*-arm64.dmg` |
| Windows x64 (Intel or AMD) | `*-x64.exe` |
| Windows ARM64 | `*-arm64.exe` |

Open the disk image on macOS and drag the app into Applications. On Windows, run the installer for your architecture. The installers are unsigned.

## Local workflow

1. Open or drop images into the workspace. Choose a tool from the sidebar.
2. Convert, compress or resize a batch. Crop, rotate, adjust colors, add a watermark or annotate an individual image.
3. Inspect the result in the preview. Choose the output folder and how to handle existing filenames, then export.

Batch import supports JPEG, PNG, WebP, GIF (first frame), BMP, TIFF, ICO and SVG. Export formats include JPEG, PNG, WebP, AVIF, TIFF, BMP, ICO and SVG with embedded raster data.

## Development

Use Node.js 24 LTS, stable Rust and the Tauri prerequisites for your desktop platform. If you use nvm, run `nvm install` to select the version from `.nvmrc`. The desktop shell and controls use React and TypeScript. The Rust engine handles batch processing, codecs, EXIF and safe output.

```bash
npm ci
npm run build
npm run test:run
cargo test --locked --manifest-path src-tauri/Cargo.toml
CARGO_PROFILE_RELEASE_LTO=thin npm run tauri build -- --bundles app
```

Use `npm run tauri dev` to open the development window. On Windows use `npm run tauri build -- --bundles nsis`.

Desktop builds generate the platform icons from the Image Studio SVG. Run `npm run icons` before invoking Cargo directly from a fresh checkout.

The interface supports all nine languages linked above. [Interface and icon design](DESIGN.md) · [Release workflow rules](AGENTS.md)
