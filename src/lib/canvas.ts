/** Async encoding avoids a large synchronous toDataURL on the UI thread. */
export async function canvasDataUrl(canvas: HTMLCanvasElement, mime = "image/png"): Promise<string> {
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => {
    if (value) resolve(value);
    else reject(new Error("Cannot encode image"));
  }, mime));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Cannot read encoded image"));
    reader.readAsDataURL(blob);
  });
}
import { join } from "@tauri-apps/api/path";
import { loadDefaultOutputDir, readAssetDataUrl, saveBytes } from "./ipc";

export async function loadCanvasImage(path: string): Promise<HTMLImageElement> {
  const url = await readAssetDataUrl(path);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Cannot decode image"));
    image.src = url;
  });
}


export async function saveCanvasImage(canvas: HTMLCanvasElement, prefix: string, format: "png" | "jpeg" = "png") {
  const dataUrl = await canvasDataUrl(canvas, `image/${format}`);
  const dir = await loadDefaultOutputDir();
  if (!dir) return null;
  const extension = format === "jpeg" ? "jpg" : format;
  const path = await join(dir, `${prefix}-${Date.now()}.${extension}`);
  await saveBytes(path, dataUrl.slice(dataUrl.indexOf(",") + 1));
  return path;
}
