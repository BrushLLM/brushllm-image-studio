import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

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
  aspect: number | null; // width / height, null = free
}

type Drag =
  | { kind: "move"; startX: number; startY: number; rect: CropRect }
  | { kind: "resize"; rect: CropRect }
  | { kind: "new"; originX: number; originY: number }
  | null;

const MIN_SIZE = 12;

const CropCanvas = forwardRef<CropCanvasHandle, Props>(function CropCanvas(
  { src, naturalSize, aspect },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rect, setRect] = useState<CropRect | null>(null);
  const drag = useRef<Drag>(null);

  const initialRect = useCallback((): CropRect => {
    // Free mode starts with the whole image selected (no crop).
    if (!aspect) {
      return {
        x: 0,
        y: 0,
        width: naturalSize.width,
        height: naturalSize.height,
      };
    }
    const w = Math.round(naturalSize.width * 0.8);
    const h = Math.min(Math.round(w / aspect), naturalSize.height);
    const clampedW = Math.min(w, naturalSize.width);
    const clampedH = Math.min(h, naturalSize.height);
    const fittedW = Math.min(clampedW, Math.round(clampedH * aspect));
    return {
      x: Math.round((naturalSize.width - fittedW) / 2),
      y: Math.round((naturalSize.height - clampedH) / 2),
      width: fittedW,
      height: clampedH,
    };
  }, [naturalSize.width, naturalSize.height, aspect]);

  useEffect(() => {
    setRect(initialRect());
  }, [initialRect]);

  // Re-fit the rect when the aspect lock changes.
  useEffect(() => {
    setRect((prev) => {
      if (!prev || !aspect) return prev;
      // From a full-image or free rect, fit the new aspect at full width.
      const width = Math.min(prev.width, naturalSize.width);
      const height = Math.min(Math.round(width / aspect), naturalSize.height);
      const fittedWidth = Math.min(Math.round(height * aspect), naturalSize.width);
      return {
        x: Math.round((naturalSize.width - fittedWidth) / 2),
        y: Math.round((naturalSize.height - height) / 2),
        width: fittedWidth,
        height,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspect]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!rect) return;
    ctx.fillStyle = "rgba(21, 27, 40, 0.5)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.clearRect(rect.x, rect.y, rect.width, rect.height);
    ctx.strokeStyle = "#2aefc8";
    ctx.lineWidth = Math.max(2, canvas.width / 500);
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    // Bottom-right handle.
    const handleSize = Math.max(14, canvas.width / 40);
    ctx.fillStyle = "#2aefc8";
    ctx.fillRect(
      rect.x + rect.width - handleSize,
      rect.y + rect.height - handleSize,
      handleSize,
      handleSize,
    );
  }, [rect, naturalSize.width, naturalSize.height]);

  useImperativeHandle(ref, () => ({
    getRect: () => rect,
  }));

  const toNatural = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * (canvas.width / bounds.width),
      y: (event.clientY - bounds.top) * (canvas.height / bounds.height),
    };
  };

  const nearHandle = (point: { x: number; y: number }, r: CropRect) => {
    const threshold = Math.max(18, naturalSize.width / 30);
    return (
      point.x > r.x + r.width - threshold &&
      point.y > r.y + r.height - threshold &&
      point.x < r.x + r.width + threshold &&
      point.y < r.y + r.height + threshold
    );
  };

  const clampRect = (r: CropRect): CropRect => {
    const width = Math.max(MIN_SIZE, Math.min(r.width, naturalSize.width));
    const height = Math.max(MIN_SIZE, Math.min(r.height, naturalSize.height));
    return {
      width,
      height,
      x: Math.max(0, Math.min(r.x, naturalSize.width - width)),
      y: Math.max(0, Math.min(r.y, naturalSize.height - height)),
    };
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!rect) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = toNatural(event);
    if (nearHandle(point, rect)) {
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
      setRect({ x: point.x, y: point.y, width: MIN_SIZE, height: MIN_SIZE });
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
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
      let width = Math.abs(point.x - active.originX);
      let height = aspect ? width / aspect : Math.abs(point.y - active.originY);
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
      <img src={src} alt="source" />
      <canvas
        ref={canvasRef}
        width={naturalSize.width}
        height={naturalSize.height}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
    </div>
  );
});

export default CropCanvas;
