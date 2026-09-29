import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
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
  Search,
  Settings as SettingsIcon,
  Sparkles,
  Stamp,
  Tags,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import type { Page } from "../pages/Home";

export interface CommandItem {
  page: Page;
  tool?: string;
  labelKey: string;
  descKey: string;
  icon: LucideIcon;
  section: "Local tools" | "AI tools" | "Other";
}

export const COMMANDS: CommandItem[] = [
  { page: "convert", labelKey: "home.convertName",
  descKey: "cmdk.convertDesc", icon: Repeat, section: "Local tools" },
  { page: "resize", labelKey: "home.resizeName",
  descKey: "cmdk.resizeDesc", icon: Maximize2, section: "Local tools" },
  { page: "compress", labelKey: "home.compressName",
  descKey: "cmdk.compressDesc", icon: Minimize2, section: "Local tools" },
  { page: "crop", labelKey: "home.cropName",
  descKey: "cmdk.cropDesc", icon: Crop, section: "Local tools" },
  { page: "stitch", labelKey: "home.stitchName",
  descKey: "cmdk.stitchDesc", icon: Combine, section: "Local tools" },
  { page: "watermark", labelKey: "home.watermarkName",
  descKey: "cmdk.watermarkDesc", icon: Stamp, section: "Local tools" },
  { page: "exif", labelKey: "home.exifName",
  descKey: "cmdk.exifDesc", icon: Tags, section: "Local tools" },
  { page: "rounded", labelKey: "home.roundedName",
  descKey: "cmdk.roundedDesc", icon: Frame, section: "Local tools" },
  { page: "picker", labelKey: "home.pickerName",
  descKey: "cmdk.pickerDesc", icon: Pipette, section: "Local tools" },
  { page: "annotate", labelKey: "home.annotateName",
  descKey: "cmdk.annotateDesc", icon: PenTool, section: "Local tools" },
  { page: "mirror", labelKey: "home.mirrorName", descKey: "cmdk.mirrorDesc", icon: FlipHorizontal, section: "Local tools" },
  { page: "adjust", labelKey: "home.adjustName", descKey: "cmdk.adjustDesc", icon: SlidersHorizontal, section: "Local tools" },
  { page: "mosaic", labelKey: "home.mosaicName", descKey: "cmdk.mosaicDesc", icon: Grid2x2, section: "Local tools" },
  { page: "shadow", labelKey: "home.shadowName", descKey: "cmdk.shadowDesc", icon: Layers, section: "Local tools" },
  { page: "colorreplace", labelKey: "home.recolorName", descKey: "cmdk.recolorDesc", icon: PaintBucket, section: "Local tools" },
  { page: "repaint", tool: "generate-image", labelKey: "home.generateName",
  descKey: "cmdk.generateDesc", icon: Sparkles, section: "AI tools" },
  { page: "repaint", tool: "remove-background", labelKey: "home.removeBgName",
  descKey: "cmdk.removeBgDesc", icon: ImageOff, section: "AI tools" },
  { page: "repaint", tool: "cutout", labelKey: "home.cutoutName",
  descKey: "cmdk.cutoutDesc", icon: Scissors, section: "AI tools" },
  { page: "repaint", tool: "remove-watermark", labelKey: "home.removeWmName",
  descKey: "cmdk.removeWmDesc", icon: Eraser, section: "AI tools" },
  { page: "repaint", tool: "remove-object", labelKey: "home.removeObjectName",
  descKey: "cmdk.removeObjDesc", icon: Bandage, section: "AI tools" },
  { page: "repaint", tool: "generative-fill", labelKey: "home.fillName",
  descKey: "cmdk.fillDesc", icon: Wand2, section: "AI tools" },
  { page: "repaint", tool: "restyle", labelKey: "home.restyleName",
  descKey: "cmdk.restyleDesc", icon: Palette, section: "AI tools" },
  { page: "settings", labelKey: "common.settings",
  descKey: "cmdk.settingsDesc", icon: SettingsIcon, section: "Other" },
];

interface Props {
  onNavigate: (page: Page, tool?: string) => void;
  onClose: () => void;
}

export default function CommandPalette({ onNavigate, onClose }: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMMANDS;
    return COMMANDS.filter(
      (item) =>
        t(item.labelKey).toLowerCase().includes(q) ||
        t(item.descKey).toLowerCase().includes(q),
    );
  }, [query]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Keep the selected row visible while arrowing through the list.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${selected}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const run = (item: CommandItem | undefined) => {
    if (!item) return;
    onNavigate(item.page, item.tool);
    onClose();
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(results.length - 1, s + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(0, s - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(results[selected]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  let lastSection = "";

  return (
    <div className="cmdk-overlay" onPointerDown={onClose}>
      <div
        className="cmdk"
        role="dialog"
        aria-modal="true"
        aria-label={t("cmdk.placeholder")}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="cmdk-search">
          <Search />
          <input
            ref={inputRef}
            value={query}
            placeholder={t("cmdk.placeholder")}
            onChange={(e) => setQuery(e.target.value)}
            spellCheck={false}
          />
          <span className="kbd cmdk-kbd">esc</span>
        </div>
        <div className="cmdk-list" ref={listRef}>
          {results.length === 0 && (
            <div className="cmdk-empty">{t("cmdk.empty", { query: query.trim() })}</div>
          )}
          {results.map((item, index) => {
            const header =
              item.section !== lastSection ? t(`cmdk.${item.section === "Local tools" ? "localSection" : item.section === "AI tools" ? "aiSection" : "otherSection"}`) : null;
            lastSection = item.section;
            return (
              <div key={`${item.page}-${item.tool ?? ""}`}>
                {header && <div className="cmdk-section">{header}</div>}
                <button
                  className={`cmdk-item${index === selected ? " selected" : ""}`}
                  data-index={index}
                  role="option"
                  aria-selected={index === selected}
                  onPointerEnter={() => setSelected(index)}
                  onClick={() => run(item)}
                >
                  <item.icon />
                  <span className="cmdk-item-text">
                    {t(item.labelKey)}
                    <span className="cmdk-item-desc">{t(item.descKey)}</span>
                  </span>
                  <span className="kbd cmdk-enter">↵</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
