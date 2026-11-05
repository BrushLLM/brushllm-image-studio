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
