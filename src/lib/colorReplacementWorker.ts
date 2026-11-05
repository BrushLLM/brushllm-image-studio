import type { Rgb } from "./colorReplacement";

export function replaceColorsOffThread(pixels: Uint8ClampedArray<ArrayBuffer>, pairs: { source: Rgb; target: string }[], tolerance: number): Promise<Uint8ClampedArray<ArrayBuffer>> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../workers/colorReplace.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      worker.terminate();
      resolve(new Uint8ClampedArray(event.data));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "Color replacement failed"));
    };
    worker.postMessage({ pixels, pairs, tolerance }, [pixels.buffer]);
  });
}
