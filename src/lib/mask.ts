export interface MaskPoint {
  x: number;
  y: number;
}

export interface MaskStroke {
  tool: "brush" | "rect" | "erase";
  points: MaskPoint[];
  size: number;
}

/** Draw one stroke onto a canvas context in natural coordinates. */
function drawStroke(ctx: CanvasRenderingContext2D, stroke: MaskStroke, color: string) {
  ctx.save();
  if (stroke.tool === "erase") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "#000";
    ctx.fillStyle = "#000";
  } else {
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
  }

  if (stroke.tool === "rect") {
    const start = stroke.points[0];
    const end = stroke.points[stroke.points.length - 1];
    if (start && end) {
      const x = Math.min(start.x, end.x);
      const y = Math.min(start.y, end.y);
      ctx.fillRect(x, y, Math.abs(end.x - start.x), Math.abs(end.y - start.y));
    }
  } else {
    ctx.lineWidth = stroke.size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let i = 1; i < stroke.points.length; i++) {
      const a = stroke.points[i - 1];
      const b = stroke.points[i];
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    const first = stroke.points[0];
    if (stroke.points.length === 1 && first) {
      ctx.beginPath();
      ctx.arc(first.x, first.y, stroke.size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function drawMask(
  canvas: HTMLCanvasElement,
  strokes: MaskStroke[],
  color: string,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const stroke of strokes) {
    drawStroke(ctx, stroke, color);
  }
}
