import { replaceColors, type Rgb } from "../lib/colorReplacement";

self.onmessage = (event: MessageEvent<{ pixels: Uint8ClampedArray<ArrayBuffer>; pairs: { source: Rgb; target: string }[]; tolerance: number }>) => {
  const { pixels, pairs, tolerance } = event.data;
  replaceColors(pixels, pairs, tolerance);
  self.postMessage(pixels.buffer, { transfer: [pixels.buffer] });
};
