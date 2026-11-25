import { usePersistedState } from "../lib/persistedState";
import { forwardRef, useImperativeHandle, useRef, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CropCanvasHandle {
  getRect: () => CropRect | null; // null = keep the full image
}

interface Props {
  src: string;
  naturalSize: { width: number; height: number };
  persistKey: string;
  aspect: number | null; // width / height, null = free
}

type Drag =
  | { kind: "move"; startX: number; startY: number; rect: CropRect }
  | { kind: "resize"; rect: CropRect }
  | { kind: "new"; originX: number; originY: number }
  | null;

const MIN_SIZE = 12;

const CropCanvas = forwardRef<CropCanvasHandle, Props>(function CropCanvas(
  { src, naturalSize, aspect, persistKey },
  ref,
) {
  const { t } = useTranslation();
  const [savedRect, setRect] = usePersistedState<CropRect | null>(persistKey, null);
  const drag = useRef<Drag>(null);
  const { width, height } = naturalSize;

  const initialRect = (): CropRect => {
    if (!aspect) return { x: 0, y: 0, width, height };
    const cropWidth = Math.max(1, Math.min(Math.round(width * 0.8), Math.round(height * aspect)));
    const cropHeight = Math.max(1, Math.min(height, Math.round(cropWidth / aspect)));
    return {
      x: Math.round((width - cropWidth) / 2),
      y: Math.round((height - cropHeight) / 2),
      width: cropWidth,
      height: cropHeight,
    };
  };
  const rect = savedRect ?? initialRect();

  useImperativeHandle(ref, () => ({
    getRect: () => {
      const rounded = {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
      return rounded.width === width && rounded.height === height ? null : rounded;
    },
  }));

  const toNatural = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const scaleX = width / bounds.width;
    const scaleY = height / bounds.height;
    return {
      x: (event.clientX - bounds.left) * scaleX,
      y: (event.clientY - bounds.top) * scaleY,
      handleWidth: 16 * scaleX,
      handleHeight: 16 * scaleY,
    };
  };

  const clampRect = (r: CropRect): CropRect => {
    const cropWidth = Math.min(width, Math.max(MIN_SIZE, r.width));
    const cropHeight = Math.min(height, Math.max(MIN_SIZE, r.height));
    return {
      width: cropWidth,
      height: cropHeight,
      x: Math.max(0, Math.min(r.x, width - cropWidth)),
      y: Math.max(0, Math.min(r.y, height - cropHeight)),
    };
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = toNatural(event);
    if (Math.abs(point.x - rect.x - rect.width) < point.handleWidth
      && Math.abs(point.y - rect.y - rect.height) < point.handleHeight) {
      drag.current = { kind: "resize", rect: { ...rect } };
    } else if (
      point.x >= rect.x &&
      point.x <= rect.x + rect.width &&
      point.y >= rect.y &&
      point.y <= rect.y + rect.height
    ) {
      drag.current = { kind: "move", startX: point.x, startY: point.y, rect: { ...rect } };
    } else {
      drag.current = { kind: "new", originX: point.x, originY: point.y };
      setRect(clampRect({ x: point.x, y: point.y, width: MIN_SIZE, height: MIN_SIZE }));
    }
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const active = drag.current;
    if (!active) return;
    const point = toNatural(event);

    if (active.kind === "move") {
      const dx = point.x - active.startX;
      const dy = point.y - active.startY;
      setRect(clampRect({ ...active.rect, x: active.rect.x + dx, y: active.rect.y + dy }));
    } else if (active.kind === "resize") {
      let width = Math.max(MIN_SIZE, point.x - active.rect.x);
      let height = aspect ? width / aspect : Math.max(MIN_SIZE, point.y - active.rect.y);
      if (width > naturalSize.width - active.rect.x) {
        width = naturalSize.width - active.rect.x;
        height = aspect ? width / aspect : height;
      }
      if (height > naturalSize.height - active.rect.y) {
        height = naturalSize.height - active.rect.y;
        if (aspect) width = height * aspect;
      }
      setRect(
        clampRect({
          x: active.rect.x,
          y: active.rect.y,
          width: Math.round(width),
          height: Math.round(height),
        }),
      );
    } else if (active.kind === "new") {
      const width = Math.abs(point.x - active.originX);
      const height = aspect ? width / aspect : Math.abs(point.y - active.originY);
      const x = point.x < active.originX ? active.originX - width : active.originX;
      const y = point.y < active.originY ? active.originY - height : active.originY;
      setRect(
        clampRect({
          x: Math.round(x),
          y: Math.round(y),
          width: Math.round(width),
          height: Math.round(height),
        }),
      );
    }
  };

  const onPointerUp = () => {
    drag.current = null;
  };

  return (
    <div className="canvas-wrap">
      <img src={src} alt={t("errors.original")} draggable={false} />
      <div
        className="crop-overlay"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onLostPointerCapture={onPointerUp}
      >
        <div
          className="crop-selection"
          style={{
            left: `${rect.x / width * 100}%`,
            top: `${rect.y / height * 100}%`,
            width: `${rect.width / width * 100}%`,
            height: `${rect.height / height * 100}%`,
          }}
        />
      </div>
    </div>
  );
});

export default CropCanvas;
