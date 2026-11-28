# BrushLLM Image Studio desktop interface

The left rail contains tools and Settings. The image workspace on the right follows the order of import, preview, editing and export.

```text
┌─ Window controls  Sidebar toggle  Back  Forward ────── Search ─┐
│ BrushLLM Image Studio │ Current tool                            │
│ All tools             ├─ Image preview ──────┬─ Parameters ───┤
│ Local tools           │                      │ Format         │
│                       │ Original   Result    │ Output         │
│                       ├─ Image queue ────────┤ Run and status │
│ Settings              │                      │                │
└───────────────────────┴──────────────────────┴────────────────┘
```

## Shared desktop design

| Role | Light | Dark |
| --- | --- | --- |
| Window | `#F5F4ED` | `#161714` |
| Navigation | `#EFEEE6` | `#1D1F1A` |
| Panel | `#FFFEFA` | `#242621` |
| Text | `#202C27` | `#F3F2E9` |
| Main actions and selected controls | `#20594F` | `#20594F` |
| Preview and import icons, success badges | `#C6DED2` | `#C6DED2` |
| App icon sun | `#A55337` | `#A55337` |
| Text on deep teal | `#FFFFFF` | `#FFFFFF` |
| Text on sage | `#202C27` | `#202C27` |

- Use the Image Studio crop-frame mark with the BrushLLM product name, system sans-serif and line icons. Use 8 px control corners, 14 px panel corners and a 4 px spacing base.
- Use a 200 px labeled sidebar and a 64 px compact rail. Mark the current route in teal and use `aria-current`. Use a 2 px keyboard outline with a 2 px offset, deep teal on light surfaces and sage on dark surfaces.
- Give the preview a neutral surface and use the sage tint for secondary controls and positive feedback. Use amber for warnings and red for errors.

## Image Studio

- At 960 px and below, the sidebar condenses automatically. The toolbar toggle and the Local tools icon reopen it. At the 760 × 560 minimum, tools, search and export remain reachable.
- The preview sits first. Before and after labels and file sizes sit outside the image. Thumbnails select the preview, while the batch action applies the same parameters to the whole queue.
- The directory organizes free on-device tools by task. Settings covers appearance, language, the default output folder and app updates.
- Tool labels and descriptions come from the tool catalog. Interface strings use all nine existing locale files.

The crop frame, landscape and copper sun use the desktop palette. The app, README and native icon generator share the same artwork. [Image Studio icon](src/assets/image-studio.svg) · [BrushLLM product page](https://brushllm.com/zh-CN/studio/)

- The macOS bundle uses ICNS. The Windows executable and NSIS installer use ICO. The 32, 128 and 256 px PNGs serve Tauri window icons and desktop bundle targets. The build generates these five files from the SVG. [Tauri bundle configuration](src-tauri/tauri.conf.json)

Implementation references are [app shell](src/App.tsx), [tool catalog](src/lib/tools.ts), [theme tokens](src/styles.css) and [workspace styles](src/studio.css).
