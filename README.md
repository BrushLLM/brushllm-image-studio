<p align="center">
  <img src=".github/assets/icon.png" width="128" alt="BrushLLM Image Studio">
</p>

<h1 align="center">BrushLLM Image Studio</h1>

<p align="center">
  <a href="https://github.com/BrushLLM/brushllm-image-studio/releases"><img src="https://img.shields.io/github/v/release/BrushLLM/brushllm-image-studio?style=flat-square&color=orange" alt="Release"></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey?style=flat-square" alt="Platforms">
  <img src="https://img.shields.io/badge/UI-9%2B6%20languages-success?style=flat-square" alt="Languages">
</p>

<p align="center">
  <strong><a href="https://brushllm.com">🌐 brushllm.com</a></strong> · <a href="https://brushllm.com/docs">Docs</a> · <a href="https://github.com/BrushLLm/brushllm-image-studio/releases">Releases</a>
</p>

<p align="center">A local-first desktop image toolbox — 15 local tools run 100% on your device for free; 7 AI-powered edits call the BrushLLM gateway.</p>

<p align="center">
  <img src=".github/assets/screenshot.png" width="800" alt="BrushLLM Image Studio">
</p>

[English](#english) | [Deutsch](#deutsch) | [Español](#español) | [Français](#français) | [Bahasa Indonesia](#bahasa-indonesia) | [Italiano](#italiano) | [Nederlands](#nederlands) | [Polski](#polski) | [Português (BR)](#português-br) | [Türkçe](#türkçe) | [Tiếng Việt](#tiếng-việt) | [简体中文](#简体中文) | [繁體中文](#繁體中文) | [日本語](#日本語) | [한국어](#한국어)

---

## English

### ✨ Features

- **Convert & compress** — batch-convert between 8 input and 8 output formats · quality presets with metadata stripping · same-format outputs never grow
- **Resize & crop** — pixels, percentage or presets (Lanczos resampling) · aspect-ratio frames, 90° rotation, flips with live preview
- **Retouch** — brightness / contrast / saturation · mosaic · drop shadow · rounded corners · text or image watermarks (tiled or positioned) · color replace for up to 6 pairs, shadows and texture preserved
- **Utilities** — EXIF view / edit / strip (lossless) · color picker (HEX/RGB one-click copy) · annotate (shapes, arrows, highlights, text) · stitch long image strips · mirror (A | A)
- **AI tools** — generate image · remove background · cutout · remove watermark · remove object · generative fill (with reference images) · restyle — cloud-powered via [brushllm.com](https://brushllm.com), billed per image
- **Also** — 9-language UI with 6 more on the way · dark mode · ⌘K command palette · batch processing · manual check-for-updates · zero telemetry

### 📥 Download

Grab the latest installer from [Releases](https://github.com/BrushLLm/brushllm-image-studio/releases):

| Platform | File |
| --- | --- |
| macOS — Apple Silicon (M-series) | `.dmg` (arm64) |
| Windows 10/11 — x64 (Intel/AMD) | `.exe` (x64) |
| Windows 10/11 — ARM64 (Snapdragon) | `.exe` (arm64) |

> **Apps are unsigned.** macOS: right-click the app → **Open** on first launch (Gatekeeper). Windows: choose **Run anyway** when SmartScreen appears — the installer opens with a 9-language selector.

### 🌐 UI Languages

**Available now (9):** English · Deutsch · Español · Français · Português (BR) · 简体中文 · 繁體中文 · 日本語 · 한국어

**Coming soon (6):** Italiano · Nederlands · Polski · Türkçe · Bahasa Indonesia · Tiếng Việt

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

### ⚠️ Known limitations

- HEIC/HEIF and AVIF **input** are not supported (AVIF output works).
- WebP output is lossy (quality slider); SVG output embeds a raster image (not vector tracing); GIF inputs use the first frame.
- Apps are unsigned (code signing can be added to CI later).

---

## Deutsch

Ein lokal-first Desktop-Werkzeugkasten für Bilder — 15 lokale Werkzeuge laufen kostenlos auf deinem Gerät; 7 KI-Bearbeitungen nutzen das BrushLLM-Gateway.

**Funktionen:** Format konvertieren (8 rein / 8 raus) · Komprimieren mit Qualitätsvorgaben · Redimensionieren (Lanczos) · Rogneren & Drehen · Spiegeln (A \| A) · Anpassen · Bilder verbinden · Wasserzeichen · EXIF · Abgerundete Ecken · Farbpipette · Beschriften · Mosaik · Schatten · Farbwechsel (bis 6 Paare).

**KI-Werkzeuge (Cloud, pro Bild abgerechnet):** Bild generieren · Hintergrund entfernen · Freistellen · Wasserzeichen entfernen · Objekt entfernen · Generatives Füllen (mit Referenzbildern) · Stil ändern.

**Highlights:** UI in 9 Sprachen, 6 weitere geplant · Dunkelmodus · ⌘K-Befehlspalette · Stapelverarbeitung · manuelle Update-Prüfung · keine Telemetrie.

**📥 Herunterladen:** aktuelle Installationspakete auf [Releases](https://github.com/BrushLLm/brushllm-image-studio/releases) — macOS `.dmg` (Apple Silicon), Windows `.exe` (x64 / ARM64). Unsignierte Apps: macOS beim ersten Start rechtsklicken und „Öffnen“ wählen; Windows „Ausführen“ bei SmartScreen.

Entwicklung und Architektur: siehe Abschnitt [English](#english).

---

## Español

Una caja de herramientas de imágenes local-first — 15 herramientas locales se ejecutan gratis en tu equipo; 7 ediciones con IA usan la pasarela de BrushLLM.

**Funciones:** convertir formato (8 de entrada / 8 de salida) · comprimir con presets de calidad · redimensionar (Lanczos) · recortar y rotar · espejo (A \| A) · ajustar · unir imágenes · marca de agua · EXIF · esquinas redondeadas · cuentagotas · anotar · mosaico · sombra · reemplazar color (hasta 6 pares).

**Herramientas de IA (nube, por imagen):** generar imagen · quitar fondo · recorte de sujeto · quitar marca de agua · quitar objeto · relleno generativo (con imágenes de referencia) · cambiar estilo.

**Lo destacado:** interfaz en 9 idiomas, 6 más en camino · modo oscuro · paleta de comandos ⌘K · proceso por lotes · comprobación manual de actualizaciones · sin telemetría.

**📥 Descargar:** instaladores en [Releases](https://github.com/BrushLLm/brushllm-image-studio/releases) — macOS `.dmg` (Apple Silicon), Windows `.exe` (x64 / ARM64). Apps sin firmar: en el primer inicio, macOS exige clic derecho → *Abrir*; Windows muestra SmartScreen → *Ejecutar de todas formas*.

Desarrollo y arquitectura: ver la sección [English](#english).

---

## Français

Une boîte à outils d'images local-first — 15 outils locaux tournent gratuitement sur votre machine ; 7 retouches IA passent par la passerelle BrushLLM.

**Fonctions :** convertir le format (8 entrées / 8 sorties) · compresser avec préréglages qualité · redimensionner (Lanczos) · rogner et pivoter · miroir (A \| A) · régler · assembler · filigrane · EXIF · coins arrondis · pipette · annoter · mosaïque · ombre · remplacer couleur (jusqu'à 6 paires).

**Outils IA (cloud, facturés à l'image) :** générer une image · supprimer l'arrière-plan · détourage · supprimer le filigrane · supprimer un objet · remplissage génératif (avec images de référence) · changer le style.

**Points forts :** interface en 9 langues, 6 autres à venir · mode sombre · palette de commandes ⌘K · traitement par lots · vérification manuelle des mises à jour · zéro télémétrie.

**📥 Téléchargement :** installateurs sur [Releases](https://github.com/BrushLLm/brushllm-image-studio/releases) — macOS `.dmg` (Apple Silicon), Windows `.exe` (x64 / ARM64). Apps non signées : au premier lancement, macOS exige clic droit puis *Ouvrir* ; Windows affiche SmartScreen → *Exécuter quand même*.

Développement et architecture : voir la section [English](#english).

---

## Bahasa Indonesia

Kotak alat gambar lokal-first — 15 alat lokal berjalan gratis di perangkatmu; 7 penyuntingan AI memakai gateway BrushLLM.

**Fitur:** konversi format (8 masuk / 8 keluar) · kompresi dengan preset kualitas · ubah ukuran (Lanczos) · potong dan putar · cermin (A \| A) · penyesuaian · gabungkan gambar · tanda air · EXIF · sudut membulat · pengambil warna · anotasi · mozaik · bayangan · ganti warna (hingga 6 pasang).

**Alat AI (cloud, per gambar):** buat gambar · hapus latar · potong objek · hapus tanda air · hapus objek · isian generatif (dengan gambar referensi) · ubah gaya.

**Sorotan:** antarmuka 9 bahasa, 6 bahasa lagi dalam rencana · mode gelap · palet perintah ⌘K · pemrosesan batch · pemeriksaan pembaruan manual · tanpa telemetri.

**📥 Unduh:** penginstal terbaru di [Releases](https://github.com/BrushLLm/brushllm-image-studio/releases) — macOS `.dmg` (Apple Silicon), Windows `.exe` (x64 / ARM64). Aplikasi tidak ditandatangani: saat pertama kali menjalankan, macOS klik kanan → *Buka*; Windows pilih *Tetap jalankan* saat SmartScreen muncul.

Pengembangan dan arsitektur: lihat bagian [English](#english).

---

## Italiano

Una cassetta di attrezzi per immagini local-first — 15 strumenti locali girano gratis sul tuo dispositivo; 7 modifiche AI usano il gateway BrushLLM.

**Funzioni:** conversione formato (8 in entrata / 8 in uscita) · compressione con preset di qualità · ridimensionamento (Lanczos) · ritaglio e rotazione · specchio (A \| A) · regolazioni · unione immagini · filigrana · EXIF · angoli arrotondati · contagocce · annotazioni · mosaico · ombra · sostituzione colore (fino a 6 coppie).

**Strumenti AI (cloud, a immagine):** genera immagine · rimuovi sfondo · ritaglia soggetto · rimuovi filigrana · rimuovi oggetto · riempimento generativo (con immagini di riferimento) · cambia stile.

**In evidenza:** interfaccia in 9 lingue, altre 6 in arrivo · modalità scura · palette comandi ⌘K · elaborazione batch · controllo manuale aggiornamenti · zero telemetria.

**📥 Scarica:** programmi di installazione su [Releases](https://github.com/BrushLLm/brushllm-image-studio/releases) — macOS `.dmg` (Apple Silicon), Windows `.exe` (x64 / ARM64). App non firmate: al primo avvio su macOS clic destro → *Apri*; su Windows scegli *Esegui comunque* quando compare SmartScreen.

Sviluppo e architettura: vedi la sezione [English](#english).

---

## Nederlands

Een local-first gereedschapskist voor afbeeldingen — 15 lokale tools draaien gratis op je apparaat; 7 AI-beweringen gebruiken de BrushLLM-gateway.

**Functies:** formaat converteren (8 in / 8 uit) · comprimeren met kwaliteitpresets · formaat wijzigen (Lanczos) · bijsnijden en roteren · spiegel (A \| A) · aanpassen · afbeeldingen samenvoegen · watermerk · EXIF · afgeronde hoeken · kleurenkiezer · annoteren · mozaïek · slagschaduw · kleur vervangen (tot 6 paren).

**AI-tools (cloud, per afbeelding):** afbeelding genereren · achtergrond verwijderen · onderwerp uitsnijden · watermerk verwijderen · object verwijderen · generatief vullen (met referentieafbeeldingen) · stijl wijzigen.

**Hoogtepunten:** interface in 9 talen, 6 extra gepland · donkere modus · ⌘K-commandopalet · batchverwerking · handmatige updatecontrole · geen telemetrie.

**📥 Download:** installers op [Releases](https://github.com/BrushLLm/brushllm-image-studio/releases) — macOS `.dmg` (Apple Silicon), Windows `.exe` (x64 / ARM64). Niet-ondertekende apps: bij de eerste start op macOS rechtsklikken → *Openen*; op Windows *Toch uitvoeren* kiezen bij SmartScreen.

Ontwikkeling en architectuur: zie de sectie [English](#english).

---

## Polski

Lokalny zestaw narzędzi do obrazów — 15 narzędzi lokalnych działa za darmo na Twoim urządzeniu; 7 edycji AI korzysta z bramki BrushLLM.

**Funkcje:** konwersja formatów (8 wejściowych / 8 wyjściowych) · kompresja z presetami jakości · zmiana rozmiaru (Lanczos) · przycinanie i obracanie · lustrzane odbicie (A \| A) · regulacja · łączenie obrazów · znak wodny · EXIF · zaokrąglone narożniki · próbnik kolorów · adnotacje · mozaika · cień · zamiana kolorów (do 6 par).

**Narzędzia AI (chmura, za obraz):** generowanie obrazu · usuwanie tła · wycinanie obiektu · usuwanie znaku wodnego · usuwanie obiektu · wypełnianie generatywne (z obrazami referencyjnymi) · zmiana stylu.

**Atuty:** interfejs w 9 językach, 6 kolejnych w planach · tryb ciemny · paleta poleceń ⌘K · przetwarzanie wsadowe · ręczne sprawdzanie aktualizacji · zero telemetrii.

**📥 Pobieranie:** instalatory na [Releases](https://github.com/BrushLLm/brushllm-image-studio/releases) — macOS `.dmg` (Apple Silicon), Windows `.exe` (x64 / ARM64). Niepodpisane aplikacje: przy pierwszym uruchomieniu na macOS kliknij prawym przyciskiem → *Otwórz*; na Windows wybierz *Uruchom mimo to* przy SmartScreen.

Rozwój i architektura: zobacz sekcję [English](#english).

---

## Português (BR)

Uma caixa de ferramentas de imagens local-first — 15 ferramentas locais rodam grátis na sua máquina; 7 edições com IA usam o gateway BrushLLM.

**Funções:** converter formato (8 de entrada / 8 de saída) · comprimir com presets de qualidade · redimensionar (Lanczos) · cortar e girar · espelhar (A \| A) · ajustar · juntar imagens · marca d'água · EXIF · cantos arredondados · conta-gotas · anotar · mosaico · sombra · trocar cor (até 6 pares).

**Ferramentas de IA (nuvem, por imagem):** gerar imagem · remover fundo · recortar sujeito · remover marca d'água · remover objeto · preenchimento generativo (com imagens de referência) · mudar estilo.

**Destaques:** interface em 9 idiomas, 6 a caminho · modo escuro · paleta de comandos ⌘K · processamento em lote · verificação manual de atualizações · zero telemetria.

**📥 Baixar:** instaladores em [Releases](https://github.com/BrushLLm/brushllm-image-studio/releases) — macOS `.dmg` (Apple Silicon), Windows `.exe` (x64 / ARM64). Apps não assinados: no primeiro início no macOS, clique com o botão direito → *Abrir*; no Windows escolha *Executar mesmo assim* no SmartScreen.

Desenvolvimento e arquitetura: veja a seção [English](#english).

---

## Türkçe

Yerel öncelikli bir masaüstü görüntü araç kutusu — 15 yerel araç cihazınızda ücretsiz çalışır; 7 yapay zekâ düzenlemesi BrushLLM ağ geçidini kullanır.

**Özellikler:** format dönüştürme (8 giriş / 8 çıkış) · kalite ön ayarlarıyla sıkıştırma · yeniden boyutlandırma (Lanczos) · kırpma ve döndürme · ayna (A \| A) · ayarlama · görüntüleri birleştirme · filigran · EXIF · yuvarlatılmış köşeler · renk seçici · not alma · mozaik · gölge · renk değiştirme (6 çifte kadar).

**Yapay zekâ araçları (bulut, görüntü başına):** görüntü oluşturma · arka plan kaldırma · özne kesme · filigran kaldırma · nesne kaldırma · üretken doldurma (referans görüntülerle) · stil değiştirme.

**Öne çıkanlar:** 9 dilli arayüz, 6 dil daha yolda · koyu mod · ⌘K komut paleti · toplu işleme · elle güncelleme denetimi · sıfır telemetri.

**📥 İndirme:** en son yükleyiciler [Releases](https://github.com/BrushLLm/brushllm-image-studio/releases) sayfasında — macOS `.dmg` (Apple Silicon), Windows `.exe` (x64 / ARM64). İmzasız uygulamalar: macOS'ta ilk açılışta sağ tıkla → *Aç*; Windows'ta SmartScreen göründüğünde *Yine de çalıştır*'ı seçin.

Geliştirme ve mimari için [English](#english) bölümüne bakın.

---

## Tiếng Việt

Bộ công cụ hình ảnh local-first — 15 công cụ cục bộ chạy miễn phí 100% trên máy của bạn; 7 chỉnh sửa AI dùng cổng BrushLLM.

**Tính năng:** chuyển đổi định dạng (8 đầu vào / 8 đầu ra) · nén với mức chất lượng · đổi kích thước (Lanczos) · cắt và xoay · phản chiếu (A \| A) · điều chỉnh · ghép hình · hình mờ · EXIF · bo góc · chọn màu · chú thích · khảm · đổ bóng · thay màu (tối đa 6 cặp).

**Công cụ AI (đám mây, tính theo từng ảnh):** tạo ảnh · xóa phông · cắt chủ thể · xóa hình mờ · xóa vật thể · tô tạo sinh (kèm ảnh tham chiếu) · đổi phong cách.

**Điểm nổi bật:** giao diện 9 ngôn ngữ, 6 ngôn ngữ nữa đang lên kế hoạch · chế độ tối · bảng lệnh ⌘K · xử lý theo loạt · kiểm tra cập nhật thủ công · không telemetries.

**📥 Tải xuống:** trình cài đặt mới nhất tại [Releases](https://github.com/BrushLLm/brushllm-image-studio/releases) — macOS `.dmg` (Apple Silicon), Windows `.exe` (x64 / ARM64). Ứng dụng chưa ký: khi chạy lần đầu trên macOS, nhấp chuột phải → *Mở*; trên Windows chọn *Vẫn chạy* khi SmartScreen xuất hiện.

Phát triển và kiến trúc: xem phần [English](#english).

---

## 简体中文

本地优先的桌面图像工具箱——15 个本地工具 100% 在本机免费运行；7 项 AI 编辑调用 BrushLLM 网关。

**功能：** 格式转换（8 进 / 8 出）· 压缩（质量档位）· 调整大小（Lanczos）· 裁剪与旋转 · 镜像（A \| A）· 调节 · 拼接长图 · 水印 · EXIF · 圆角 · 取色器 · 标注 · 马赛克 · 阴影 · 颜色替换（最多 6 组）。

**AI 工具（云端，按张计费）：** 生成图片 · 去除背景 · 抠图 · 去水印 · 去除物体 · 生成填充（支持参考图）· 风格变换。

**亮点：** 九语言界面，六种语言开发中 · 深色模式 · ⌘K 命令面板 · 批量处理 · 手动检查更新 · 零遥测。

**📥 下载：** 最新安装包见 [Releases](https://github.com/BrushLLm/brushllm-image-studio/releases)——macOS `.dmg`（Apple Silicon）、Windows `.exe`（x64 / ARM64）。应用未签名：macOS 首次运行右键点击→「打开」；Windows 在 SmartScreen 提示时选择「仍要运行」。

开发与架构说明见 [English](#english) 章节。

---

## 繁體中文

本機優先的桌面影像工具箱——15 個本機工具 100% 在本機免費執行；7 項 AI 編輯呼叫 BrushLLM 閘道。

**功能：** 格式轉換（8 進 / 8 出）· 壓縮（品質檔位）· 調整大小（Lanczos）· 裁切與旋轉 · 鏡像（A \| A）· 調節 · 拼接長圖 · 浮水印 · EXIF · 圓角 · 取色器 · 標註 · 馬賽克 · 陰影 · 顏色替換（最多 6 組）。

**AI 工具（雲端，按張計費）：** 產生圖片 · 去除背景 · 去背 · 去浮水印 · 去除物件 · 生成填充（支援參考圖）· 風格變換。

**亮點：** 九語言介面，六種語言開發中 · 深色模式 · ⌘K 命令面板 · 批次處理 · 手動檢查更新 · 零遙測。

**📥 下載：** 最新安裝包見 [Releases](https://github.com/BrushLLm/brushllm-image-studio/releases)——macOS `.dmg`（Apple Silicon）、Windows `.exe`（x64 / ARM64）。應用程式未簽署：macOS 首次執行右鍵點擊→「開啟」；Windows 在 SmartScreen 提示時選擇「仍要執行」。

開發與架構說明見 [English](#english) 章節。

---

## 日本語

ローカルファーストのデスクトップ画像ツールボックス — 15 のローカルツールが 100% 端末上で無料で動作し、7 つの AI 編集は BrushLLM ゲートウェイを利用します。

**機能：** フォーマット変換（8 入力 / 8 出力）· 圧縮（品質プリセット）· リサイズ（Lanczos）· 切り抜きと回転 · ミラー（A \| A）· 調整 · 画像連結 · ウォーターマーク · EXIF · 角丸 · カラーピッカー · 注釈 · モザイク · 影付け · 色置換（最大 6 ペア）。

**AI ツール（クラウド、1 枚ごとに課金）：** 画像生成 · 背景除去 · 切り抜き · ウォーターマーク除去 · オブジェクト除去 · 生成フィル（参照画像対応）· スタイル変換。

**ハイライト：** 9 言語 UI、さらに 6 言語を計画中 · ダークモード · ⌘K コマンドパレット · 一括処理 · 手動アップデート確認 · テレメトリなし。

**📥 ダウンロード：** 最新のインストーラーは [Releases](https://github.com/BrushLLm/brushllm-image-studio/releases) — macOS `.dmg`（Apple Silicon）、Windows `.exe`（x64 / ARM64）。未署名アプリ：macOS は初回起動時に右クリックで「開く」を選択、Windows は SmartScreen の警告で「実行」を選んでください。

開発とアーキテクチャの詳細は [English](#english) を参照。

---

## 한국어

로컬 우선 데스크톱 이미지 도구함 — 15 개의 로컬 도구가 100% 기기에서 무료로 실행되고, 7 가지 AI 편집은 BrushLLM 게이트웨이를 사용합니다.

**기능:** 포맷 변환(8 입력 / 8 출력) · 품질 프리셋 압축 · 크기 조정(Lanczos) · 자르기와 회전 · 미러(A \| A) · 조정 · 이미지 이어붙이기 · 워터마크 · EXIF · 모서리 둥글게 · 컬러 피커 · 주석 · 모자이크 · 그림자 · 색상 교체(최대 6 쌍).

**AI 도구(클라우드, 장당 과금):** 이미지 생성 · 배경 제거 · 누끼 · 워터마크 제거 · 사물 제거 · 생성 채우기(참조 이미지 지원) · 스타일 변환.

**하이라이트:** 9개 언어 UI, 6개 언어 추가 계획 · 다크 모드 · ⌘K 커맨드 팔레트 · 일괄 처리 · 수동 업데이트 확인 · 텔레메트리 없음.

**📥 다운로드:** 최신 설치 파일은 [Releases](https://github.com/BrushLLm/brushllm-image-studio/releases) — macOS `.dmg`(Apple Silicon), Windows `.exe`(x64 / ARM64). 미서명 앱: macOS는 첫 실행 시 마우스 오른쪽 클릭으로 *열기*를, Windows는 SmartScreen 경고에서 *실행*을 선택하세요.

개발 및 아키텍처 세부 사항은 [English](#english) 섹션을 참고하세요.
