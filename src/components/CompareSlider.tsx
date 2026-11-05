import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronsLeftRight } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  before: string;
  after: string;
  /** Corner captions, e.g. "Original · 1.2 MB" / "AVIF q75 · 340 KB". */
  beforeTag?: string;
  afterTag?: string;
}

/**
 * Squoosh-style draggable before/after comparison. Drag anywhere on the
 * image; the divider follows the pointer horizontally.
 */
export default function CompareSlider({ before, after, beforeTag, afterTag }: Props) {
  const { t } = useTranslation();
  const [value, setValue] = useState(50);
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const updateFromEvent = useCallback((clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setValue(Math.min(100, Math.max(0, pct)));
  }, []);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.currentTarget.focus();
    updateFromEvent(e.clientX);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragging.current) updateFromEvent(e.clientX);
  };

  const stop = () => {
    dragging.current = false;
  };

  return (
    <div
      className="ba"
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={t("common.compare")}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 10 : 1;
        if (e.key === "Home") setValue(0);
        else if (e.key === "End") setValue(100);
        else if (e.key === "ArrowLeft" || e.key === "ArrowDown") setValue((v) => Math.max(0, v - step));
        else if (e.key === "ArrowRight" || e.key === "ArrowUp") setValue((v) => Math.min(100, v + step));
        else return;
        e.preventDefault();
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      onPointerLeave={stop}
    >
      <img
        src={before}
        alt="before"
        draggable={false}
        className="img-fade"
        onLoad={(e) => e.currentTarget.classList.add("loaded")}
      />
      <div className="ba-after" style={{ clipPath: `inset(0 ${100 - value}% 0 0)` }}>
        <img
          src={after}
          alt="after"
          draggable={false}
          className="img-fade"
          onLoad={(e) => e.currentTarget.classList.add("loaded")}
        />
      </div>
      <div className="ba-divider" style={{ left: `calc(${value}% - 1px)` }} />
      <div className="ba-handle" style={{ left: `${value}%` }}>
        <ChevronsLeftRight />
      </div>
      {beforeTag && (
        <span className="ba-tag" style={{ left: 10 }}>
          {beforeTag}
        </span>
      )}
      <span className="ba-tag" style={{ right: 10 }}>
        {afterTag ?? t("common.result")}
      </span>
    </div>
  );
}
