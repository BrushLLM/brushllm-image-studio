<img src="../src/assets/image-studio.svg" width="88" height="88" alt="">

# BrushLLM Image Studio

Retouchez vos images sur macOS et Windows. Les outils locaux fonctionnent gratuitement sur votre appareil et sont accessibles sans compte.

**[Télécharger la dernière version](https://github.com/BrushLLM/brushllm-image-studio/releases/latest)** · [Page du produit](https://brushllm.com/fr/studio/)

[English](../README.md) · [Deutsch](../docs/README.de.md) · [Español](../docs/README.es.md) · [Français](../docs/README.fr.md) · [Português (Brasil)](../docs/README.pt-BR.md) · [日本語](../docs/README.ja.md) · [한국어](../docs/README.ko.md) · [简体中文](../docs/README.zh-CN.md) · [繁體中文](../docs/README.zh-TW.md)

![Image Studio compare une photo originale et un WebP compressé, puis affiche le résultat de l’export par lot](../.github/assets/workspace.svg)

Photo d’exemple du [parc national Olympique](https://www.flickr.com/photos/131856925@N02/22938296331).

## Téléchargement

| Système | Programme d’installation |
| --- | --- |
| macOS avec Apple Silicon | `*-arm64.dmg` |
| Windows x64 (Intel ou AMD) | `*-x64.exe` |
| Windows ARM64 | `*-arm64.exe` |

Sur macOS, ouvrez l’image disque et glissez l’application dans Applications. Sur Windows, lancez le programme adapté à votre architecture. Les fichiers d’installation sont distribués sans signature.

## Retouche locale

1. Ouvrez vos images ou déposez-les dans l’espace de travail. Choisissez un outil dans la barre latérale.
2. Convertissez, compressez ou redimensionnez un lot. Recadrez et pivotez une image, ajustez les couleurs ou ajoutez un filigrane et des annotations.
3. Contrôlez le résultat dans l’aperçu. Choisissez le dossier de sortie et le traitement des noms existants, puis exportez.

L’import par lot accepte les formats JPEG, PNG, WebP, GIF (première image), BMP, TIFF, ICO et SVG. L’export propose les formats JPEG, PNG, WebP, AVIF, TIFF, BMP, ICO et SVG avec données matricielles intégrées.

## IA en ligne

Générez des images, supprimez un arrière-plan ou un objet, détourez un sujet ou retouchez une image avec une instruction et un masque. Configurez votre clé d’API dans les paramètres. Le service configuré reçoit votre instruction et les images ou masques joints. La facturation dépend de l’usage.

## Développement

[Compilation et tests](../README.md#development)
