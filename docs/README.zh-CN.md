<img src="../src/assets/image-studio.svg" width="88" height="88" alt="">

# BrushLLM Image Studio

在 macOS 和 Windows 上编辑图片。本地工具在设备上免费运行，无需注册账号。

**[下载最新版本](https://github.com/BrushLLM/brushllm-image-studio/releases/latest)** · [产品页](https://brushllm.com/zh-CN/studio/)

[English](../README.md) · [Deutsch](../docs/README.de.md) · [Español](../docs/README.es.md) · [Français](../docs/README.fr.md) · [Português (Brasil)](../docs/README.pt-BR.md) · [日本語](../docs/README.ja.md) · [한국어](../docs/README.ko.md) · [简体中文](../docs/README.zh-CN.md) · [繁體中文](../docs/README.zh-TW.md)

![Image Studio 对比原图与压缩后的 WebP，并展示批量导出结果](../.github/assets/workspace.svg)

示例照片由 [奥林匹克国家公园](https://www.flickr.com/photos/131856925@N02/22938296331) 提供。

## 下载

| 系统 | 安装包 |
| --- | --- |
| macOS Apple Silicon | `*-arm64.dmg` |
| Windows x64（Intel 或 AMD） | `*-x64.exe` |
| Windows ARM64 | `*-arm64.exe` |

macOS 打开磁盘映像并将应用拖入「应用程序」。Windows 运行与设备架构匹配的安装包。安装包未签名。

## 本地图像工作流

1. 在工作区打开或拖入图片，从左侧选择工具。
2. 批量转换、压缩或调整尺寸。也可对单张图片裁剪、旋转、调色、添加水印或标注。
3. 预览并对比效果。选择输出目录和同名文件处理方式，再导出。

批量导入支持 JPEG、PNG、WebP、GIF（首帧）、BMP、TIFF、ICO 和 SVG。可导出 JPEG、PNG、WebP、AVIF、TIFF、BMP、ICO 和内嵌位图的 SVG。

## 在线 AI

可以生成图片、去除背景或物体、抠图，也可以用提示词和蒙版编辑。请在设置中配置 API 密钥。提示词和附带的图片或蒙版会发送至所配置的服务，费用按用量计算。

## 开发

[构建和测试](../README.md#development)
