export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHsv({ r, g, b }: Rgb): [number, number, number] {
  const rn = r / 255,
    gn = g / 255,
    bn = b / 255;
  const max = Math.max(rn, gn, bn),
    min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return [h, s, max];
}

function hsvToRgb(h: number, s: number, v: number): Rgb {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rgb: [number, number, number];
  const seg = Math.floor(h / 60) % 6;
  if (seg === 0) rgb = [c, x, 0];
  else if (seg === 1) rgb = [x, c, 0];
  else if (seg === 2) rgb = [0, c, x];
  else if (seg === 3) rgb = [0, x, c];
  else if (seg === 4) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return {
    r: Math.round((rgb[0] + m) * 255),
    g: Math.round((rgb[1] + m) * 255),
    b: Math.round((rgb[2] + m) * 255),
  };
}

/** Hue distance on the 0..360 ring. */
function hueDist(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Multi-pair color replacement — NEAREST-MATCH semantics.
 *
 * Matching: every pixel is scored against EVERY enabled pair, and the pair
 * with the highest score (the nearest source color) claims it. Pairs never
 * short-circuit each other by list order: two similar source colors split
 * the image by proximity, so #435DFD→purple and #5447FE→green both fire
 * even when their tolerances overlap. The score is a weighted distance in
 * HSV space: hue carries the main weight, saturation a soft secondary term
 * (so shadows and highlights of the source color still match), and a small
 * capped value term acts only as a brightness tie-breaker between rules.
 *
 * All scores are computed from the pixel's ORIGINAL values — each pixel is
 * written at most once, after every rule has been compared, so no pair's
 * replacement can ever pollute another pair's matching.
 *
 * Replacement: the winning pair swaps the hue and keeps the pixel's own
 * saturation/value (shading and texture survive). Gray sources have no hue
 * to swap, so they adopt the target's saturation; neutral targets (white/
 * black/gray) have no meaningful hue, so pixels desaturate toward the
 * target's brightness instead.
 */
export function replaceColors(
  data: Uint8ClampedArray,
  pairs: { source: Rgb; target: string }[],
  tolerance: number,
) {
  const rules = pairs.map(({ source, target }) => {
    const [fh, fs, fv] = rgbToHsv(source);
    const [th, ts, tv] = rgbToHsv(hexToRgb(target));
    return { fh, fs, fv, th, ts, tv };
  });
  const tolHue = (tolerance / 100) * 60;
  for (let i = 0; i < data.length; i += 4) {
    const [h, s, v] = rgbToHsv({ r: data[i], g: data[i + 1], b: data[i + 2] });
    let best = -1;
    let bestMatch = 0;
    for (let r = 0; r < rules.length; r++) {
      const rule = rules[r];
      let match: number;
      if (rule.fs < 0.12) {
        // Grayscale source: only near-gray pixels are eligible; the score
        // is brightness distance (a gray pixel has no hue to compare).
        if (s >= 0.12) continue;
        match = 1 - Math.min(1, Math.abs(v - rule.fv) / 0.25);
      } else {
        const dh = hueDist(h, rule.fh);
        const ds = Math.abs(s - rule.fs);
        match = dh <= tolHue ? 1 - dh / Math.max(1, tolHue) : 0;
        // Very unsaturated pixels of any hue are not "the source color".
        if (s < 0.08) match = 0;
        match *= 1 - Math.min(1, ds / 0.9);
        // Brightness tie-breaker between rules with similar color scores;
        // capped at 0.1 so it can never outvote the hue/saturation terms
        // (shadows and highlights of the source color still match).
        match -= Math.abs(v - rule.fv) * 0.1;
      }
      if (match <= bestMatch) continue;
      bestMatch = match;
      best = r;
    }
    if (best < 0) continue;
    const winner = rules[best];
    const mixed: Rgb =
      winner.fs < 0.12
        ? winner.ts < 0.12
          ? hsvToRgb(winner.th, 0, winner.tv)
          : hsvToRgb(winner.th, winner.ts, v)
        : winner.ts < 0.12
          ? hsvToRgb(h, 0, winner.tv)
          : hsvToRgb(winner.th, s, v);
    data[i] = Math.round(data[i] + (mixed.r - data[i]) * bestMatch);
    data[i + 1] = Math.round(data[i + 1] + (mixed.g - data[i + 1]) * bestMatch);
    data[i + 2] = Math.round(data[i + 2] + (mixed.b - data[i + 2]) * bestMatch);
  }
}
