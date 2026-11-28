<img src="../src/assets/image-studio.svg" width="88" height="88" alt="">

# BrushLLM Image Studio

macOS と Windows で画像を編集できます。ローカルツールは端末内で無料で動作し、アカウントは不要です。

**[最新版をダウンロード](https://github.com/BrushLLM/brushllm-image-studio/releases/latest)** · [製品ページ](https://brushllm.com/ja/studio/)

[English](../README.md) · [Deutsch](../docs/README.de.md) · [Español](../docs/README.es.md) · [Français](../docs/README.fr.md) · [Português (Brasil)](../docs/README.pt-BR.md) · [日本語](../docs/README.ja.md) · [한국어](../docs/README.ko.md) · [简体中文](../docs/README.zh-CN.md) · [繁體中文](../docs/README.zh-TW.md)

![画像の読み込みとローカルツール一覧を表示する Image Studio](../.github/assets/workspace.svg)

## ダウンロード

| システム | インストーラー |
| --- | --- |
| macOS（Apple Silicon） | `*-arm64.dmg` |
| Windows x64（Intel または AMD） | `*-x64.exe` |
| Windows ARM64 | `*-arm64.exe` |

macOS ではディスクイメージを開き、アプリを「アプリケーション」にドラッグします。Windows では対応するアーキテクチャのインストーラーを実行します。配布ファイルは未署名です。

## ローカルでの作業手順

1. 画像を開くか、作業領域にドラッグします。サイドバーでツールを選択します。
2. 複数の画像を一括変換、圧縮、リサイズできます。個別の画像は切り抜き、回転、色調整、透かしや注釈の追加ができます。
3. プレビューで結果を確認します。出力先と同名ファイルの扱いを選択して書き出します。

一括読み込みは JPEG、PNG、WebP、GIF（最初のフレーム）、BMP、TIFF、ICO、SVG に対応しています。JPEG、PNG、WebP、AVIF、TIFF、BMP、ICO、ラスターデータを埋め込んだ SVG に書き出せます。

## 開発

[ビルドとテストの手順](../README.md#development)
