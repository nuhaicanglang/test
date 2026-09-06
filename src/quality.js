export const QUALITY = Object.freeze({
  low: {
    texture: "1k",
    detail: "1k",
    dpr: 1,
    shadows: 0,
    ao: false,
    snow: 180,
    trees: 130,
  },
  high: {
    texture: "2k",
    detail: "2k",
    dpr: 1.25,
    shadows: 1,
    ao: true,
    snow: 560,
    trees: 210,
  },
  ultra: {
    texture: "4k",
    detail: "2k",
    dpr: 1.75,
    shadows: 3,
    ao: true,
    snow: 1100,
    trees: 300,
  },
});
export const normalizeQuality = (value, fallback = "ultra") =>
  value === "medium"
    ? "high"
    : Object.hasOwn(QUALITY, value)
      ? value
      : fallback;
export function defaultQuality() {
  return globalThis.matchMedia?.("(pointer: coarse)").matches ? "low" : "ultra";
}
