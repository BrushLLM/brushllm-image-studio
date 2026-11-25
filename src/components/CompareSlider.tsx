import { useRef, useState, type PointerEvent } from "react";
import { ChevronsLeftRight } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  before: string;
  after: string;
  beforeTag?: string;
  afterTag?: string;
}

/** Drag or use the arrow keys to reveal the original on the left and the result on the right. */
export default function CompareSlider({ before, after, beforeTag, afterTag }: Props) {
  const { t } = useTranslation();
  const [value, setValue] = useState(50);
  const [sourceSize, setSourceSize] = useState<{ url: string; ratio: number }>();
  const dragging = useRef(false);
  const ratio = sourceSize?.url === before ? sourceSize.ratio : undefined;

  const updateFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const { left, width } = event.currentTarget.getBoundingClientRect();
    if (!width) return;
    setValue(Math.min(100, Math.max(0, (event.clientX - left) * 100 / width)));
  };

  return (
    <figure className="compare-figure">
      <div
        className="ba"
        style={ratio ? { width: `min(100%, calc(var(--preview-max-height) * ${ratio}))` } : undefined}
        role="slider"
        tabIndex={0}
        aria-label={t("common.compare")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value)}
        onKeyDown={(event) => {
          if (event.altKey || event.ctrlKey || event.metaKey) return;
          const step = event.shiftKey ? 10 : 1;
          if (event.key === "Home") setValue(0);
          else if (event.key === "End") setValue(100);
          else if (event.key === "ArrowLeft" || event.key === "ArrowDown") setValue((v) => Math.max(0, v - step));
          else if (event.key === "ArrowRight" || event.key === "ArrowUp") setValue((v) => Math.min(100, v + step));
          else return;
          event.preventDefault();
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          dragging.current = true;
          event.currentTarget.setPointerCapture?.(event.pointerId);
          event.currentTarget.focus();
          updateFromPointer(event);
        }}
        onPointerMove={(event) => {
          if (dragging.current) updateFromPointer(event);
        }}
        onPointerUp={() => { dragging.current = false; }}
        onPointerCancel={() => { dragging.current = false; }}
        onLostPointerCapture={() => { dragging.current = false; }}
      >
        <img
          className="ba-source"
          src={before}
          alt=""
          draggable={false}
          onLoad={({ currentTarget: { naturalWidth, naturalHeight } }) => {
            if (naturalHeight) setSourceSize({ url: before, ratio: naturalWidth / naturalHeight });
          }}
        />
        <div className="ba-after" style={{ clipPath: `inset(0 0 0 ${value}%)` }}>
          <img src={after} alt="" draggable={false} />
        </div>
        <div className="ba-divider" style={{ left: `calc(${value}% - 1px)` }} />
        <div className="ba-handle" style={{ left: `${value}%` }}>
          <ChevronsLeftRight aria-hidden="true" />
        </div>
      </div>
      <figcaption className="compare-captions">
        <span>{beforeTag ?? t("errors.original")}</span>
        <span>{afterTag ?? t("common.result")}</span>
      </figcaption>
    </figure>
  );
}
