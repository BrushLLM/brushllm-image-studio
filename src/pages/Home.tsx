import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import {
  Bandage,
  Combine,
  Crop,
  Eraser,
  FlipHorizontal,
  Frame,
  Grid2x2,
  Layers,
  PaintBucket,
  SlidersHorizontal,
  ImageOff,
  Maximize2,
  Minimize2,
  Palette,
  PenTool,
  Pipette,
  Repeat,
  Scissors,
  Sparkles,
  Stamp,
  Tags,
  Wand2,
  type LucideIcon,
} from "lucide-react";

type Page =
  | "home"
  | "convert"
  | "resize"
  | "compress"
  | "crop"
  | "stitch"
  | "watermark"
  | "exif"
  | "rounded"
  | "picker"
  | "annotate"
  | "mirror"
  | "adjust"
  | "mosaic"
  | "shadow"
  | "colorreplace"
  | "repaint"
  | "settings";

interface LocalTool {
  page: Page;
  icon: LucideIcon;
  nameKey: string;
  descKey: string;
}

interface CloudTool {
  icon: LucideIcon;
  nameKey: string;
  descKey: string;
  tool: string;
}

const LOCAL_TOOLS: LocalTool[] = [
  {
    page: "convert",
    icon: Repeat,
    nameKey: "home.convertName",
    descKey: "home.convertDesc",
  },
  {
    page: "compress",
    icon: Minimize2,
    nameKey: "home.compressName",
    descKey: "home.compressDesc",
  },
  {
    page: "resize",
    icon: Maximize2,
    nameKey: "home.resizeName",
    descKey: "home.resizeDesc",
  },
  {
    page: "crop",
    icon: Crop,
    nameKey: "home.cropName",
    descKey: "home.cropDesc",
  },
  {
    page: "watermark",
    icon: Stamp,
    nameKey: "home.watermarkName",
    descKey: "home.watermarkDesc",
  },
  {
    page: "exif",
    icon: Tags,
    nameKey: "home.exifName",
    descKey: "home.exifDesc",
  },
  {
    page: "stitch",
    icon: Combine,
    nameKey: "home.stitchName",
    descKey: "home.stitchDesc",
  },
  {
    page: "rounded",
    icon: Frame,
    nameKey: "home.roundedName",
    descKey: "home.roundedDesc",
  },
  {
    page: "picker",
    icon: Pipette,
    nameKey: "home.pickerName",
    descKey: "home.pickerDesc",
  },
  {
    page: "annotate",
    icon: PenTool,
    nameKey: "home.annotateName",
    descKey: "home.annotateDesc",
  },
  {
    page: "mirror",
    icon: FlipHorizontal,
    nameKey: "home.mirrorName",
    descKey: "home.mirrorDesc",
  },
  {
    page: "adjust",
    icon: SlidersHorizontal,
    nameKey: "home.adjustName",
    descKey: "home.adjustDesc",
  },
  {
    page: "mosaic",
    icon: Grid2x2,
    nameKey: "home.mosaicName",
    descKey: "home.mosaicDesc",
  },
  {
    page: "shadow",
    icon: Layers,
    nameKey: "home.shadowName",
    descKey: "home.shadowDesc",
  },
  {
    page: "colorreplace",
    icon: PaintBucket,
    nameKey: "home.recolorName",
    descKey: "home.recolorDesc",
  },
];

const CLOUD_TOOLS: CloudTool[] = [
{
    icon: Sparkles,
    nameKey: "home.generateName",
    descKey: "home.generateDesc",
    tool: "generate-image",
  },
{
    icon: ImageOff,
    nameKey: "home.removeBgName",
    descKey: "home.removeBgDesc",
    tool: "remove-background",
  },
{
    icon: Scissors,
    nameKey: "home.cutoutName",
    descKey: "home.cutoutDesc",
    tool: "cutout",
  },
{
    icon: Eraser,
    nameKey: "home.removeWmName",
    descKey: "home.removeWmDesc",
    tool: "remove-watermark",
  },
{
    icon: Bandage,
    nameKey: "home.removeObjectName",
    descKey: "home.removeObjDesc",
    tool: "remove-object",
  },
{
    icon: Wand2,
    nameKey: "home.fillName",
    descKey: "home.fillDesc",
    tool: "generative-fill",
  },
{
    icon: Palette,
    nameKey: "home.restyleName",
    descKey: "home.restyleDesc",
    tool: "restyle",
  },
];

interface Props {
  onNavigate: (page: Page, tool?: string) => void;
}

export default function Home({ onNavigate }: Props) {
  const { t } = useTranslation();
  return (
    <div className="page">
      <div className="home-hero">
        <h1>{t('home.heroTitle')}</h1>
        <p>{t('home.heroSub')}</p>
      </div>

      <div className="section-label">
        <span className="dot" />
        {t('home.localSection')}
      </div>
      <div className="tool-grid">
        {LOCAL_TOOLS.map((tool) => (
          <button
            key={tool.page}
            className="tool-card"
            onClick={() => onNavigate(tool.page)}
          >
            <div className="tool-icon">
              <tool.icon />
            </div>
            <div className="tool-name">{t(tool.nameKey)}</div>
            <div className="tool-desc">{t(tool.descKey)}</div>
            <div className="tool-price free">{t("home.freeForever")}</div>
          </button>
        ))}
      </div>

      <div className="section-label cloud">
        <span className="dot" />
        {t('home.cloudSection')}
      </div>
      <div className="tool-grid">
        {CLOUD_TOOLS.map((tool) => (
          <button
            key={tool.tool}
            className="tool-card cloud"
            onClick={() => onNavigate("repaint", tool.tool)}
          >
            <div className="tool-icon">
              <tool.icon />
            </div>
            <div className="tool-name">{t(tool.nameKey)}</div>
            <div className="tool-desc">{t(tool.descKey)}</div>
            <div className="tool-price">{t("home.usesCredits")}</div>
          </button>
        ))}
      </div>

      <div className="home-footer">
        <span>BrushLLM Image Studio v0.0.1</span>
        <a onClick={() => openUrl("https://brushllm.com/")}>{t("footer.website")}</a>
        <a onClick={() => openUrl("https://brushllm.com/docs")}>{t("footer.apiDocs")}</a>
      </div>
    </div>
  );
}

export type { Page };
