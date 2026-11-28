import {
  Combine,
  Crop,
  FlipHorizontal,
  Frame,
  Grid2x2,
  Layers,
  Maximize2,
  Minimize2,
  PaintBucket,
  PenTool,
  Pipette,
  Repeat,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Stamp,
  Tags,
  type LucideIcon,
} from "lucide-react";

interface ToolDefinition {
  id: string;
  icon: LucideIcon;
  labelKey: string;
  descriptionKey: string;
  searchDescriptionKey: string;
  keywords: readonly string[];
}

const LOCAL_GROUP_KEYS = ["fileTools", "editTools", "markTools"] as const;

export const LOCAL_TOOLS = [
  {
    id: "convert",
    group: "fileTools",
    icon: Repeat,
    labelKey: "home.convertName",
    descriptionKey: "home.convertDesc",
    searchDescriptionKey: "cmdk.convertDesc",
    keywords: ["convert", "format", "jpg", "jpeg", "png", "webp", "avif"],
  },
  {
    id: "compress",
    group: "fileTools",
    icon: Minimize2,
    labelKey: "home.compressName",
    descriptionKey: "home.compressDesc",
    searchDescriptionKey: "cmdk.compressDesc",
    keywords: ["compress", "shrink", "smaller", "quality"],
  },
  {
    id: "resize",
    group: "fileTools",
    icon: Maximize2,
    labelKey: "home.resizeName",
    descriptionKey: "home.resizeDesc",
    searchDescriptionKey: "cmdk.resizeDesc",
    keywords: ["resize", "scale"],
  },
  {
    id: "crop",
    group: "editTools",
    icon: Crop,
    labelKey: "home.cropName",
    descriptionKey: "home.cropDesc",
    searchDescriptionKey: "cmdk.cropDesc",
    keywords: ["crop", "rotate", "flip"],
  },
  {
    id: "watermark",
    group: "markTools",
    icon: Stamp,
    labelKey: "home.watermarkName",
    descriptionKey: "home.watermarkDesc",
    searchDescriptionKey: "cmdk.watermarkDesc",
    keywords: ["watermark", "overlay", "text"],
  },
  {
    id: "exif",
    group: "fileTools",
    icon: Tags,
    labelKey: "home.exifName",
    descriptionKey: "home.exifDesc",
    searchDescriptionKey: "cmdk.exifDesc",
    keywords: ["exif", "metadata", "gps"],
  },
  {
    id: "stitch",
    group: "fileTools",
    icon: Combine,
    labelKey: "home.stitchName",
    descriptionKey: "home.stitchDesc",
    searchDescriptionKey: "cmdk.stitchDesc",
    keywords: ["stitch", "combine", "strip", "long"],
  },
  {
    id: "rounded",
    group: "editTools",
    icon: Frame,
    labelKey: "home.roundedName",
    descriptionKey: "home.roundedDesc",
    searchDescriptionKey: "cmdk.roundedDesc",
    keywords: ["rounded", "corners", "radius"],
  },
  {
    id: "picker",
    group: "markTools",
    icon: Pipette,
    labelKey: "home.pickerName",
    descriptionKey: "home.pickerDesc",
    searchDescriptionKey: "cmdk.pickerDesc",
    keywords: ["picker", "color", "eyedropper", "hex", "rgb"],
  },
  {
    id: "annotate",
    group: "markTools",
    icon: PenTool,
    labelKey: "home.annotateName",
    descriptionKey: "home.annotateDesc",
    searchDescriptionKey: "cmdk.annotateDesc",
    keywords: ["annotate", "markup", "arrows", "shapes"],
  },
  {
    id: "mirror",
    group: "editTools",
    icon: FlipHorizontal,
    labelKey: "home.mirrorName",
    descriptionKey: "home.mirrorDesc",
    searchDescriptionKey: "cmdk.mirrorDesc",
    keywords: ["mirror", "reflect", "symmetry"],
  },
  {
    id: "adjust",
    group: "editTools",
    icon: SlidersHorizontal,
    labelKey: "home.adjustName",
    descriptionKey: "home.adjustDesc",
    searchDescriptionKey: "cmdk.adjustDesc",
    keywords: ["adjust", "brightness", "contrast", "saturation"],
  },
  {
    id: "mosaic",
    group: "editTools",
    icon: Grid2x2,
    labelKey: "home.mosaicName",
    descriptionKey: "home.mosaicDesc",
    searchDescriptionKey: "cmdk.mosaicDesc",
    keywords: ["mosaic", "pixelate", "blur", "censor"],
  },
  {
    id: "shadow",
    group: "editTools",
    icon: Layers,
    labelKey: "home.shadowName",
    descriptionKey: "home.shadowDesc",
    searchDescriptionKey: "cmdk.shadowDesc",
    keywords: ["shadow", "drop shadow"],
  },
  {
    id: "colorreplace",
    group: "editTools",
    icon: PaintBucket,
    labelKey: "home.recolorName",
    descriptionKey: "home.recolorDesc",
    searchDescriptionKey: "cmdk.recolorDesc",
    keywords: ["colorreplace", "color replace", "recolor", "swap color"],
  },
] as const satisfies readonly (ToolDefinition & { group: (typeof LOCAL_GROUP_KEYS)[number] })[];

export const LOCAL_TOOL_GROUPS = LOCAL_GROUP_KEYS.map((group) => ({
  title: `navigation.${group}`,
  tools: LOCAL_TOOLS.filter((tool) => tool.group === group),
}));

export const SETTINGS_TOOL = {
  id: "settings",
  icon: SettingsIcon,
  labelKey: "common.settings",
  descriptionKey: "cmdk.settingsDesc",
  searchDescriptionKey: "cmdk.settingsDesc",
  keywords: ["settings", "preferences", "theme", "language", "output folder"],
} as const satisfies ToolDefinition;

export type LocalToolId = (typeof LOCAL_TOOLS)[number]["id"];
export type Page = "home" | "settings" | LocalToolId;
export type Tool = (typeof LOCAL_TOOLS)[number] | typeof SETTINGS_TOOL;

const TOOLS = [...LOCAL_TOOLS, SETTINGS_TOOL];

export function pageLabelKey(page: Page): string {
  return TOOLS.find(({ id }) => id === page)?.labelKey ?? "navigation.allTools";
}
