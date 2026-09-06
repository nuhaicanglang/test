import { hash2, smooth, regionAt } from "./mountain-field.js";
export const START_TIMES = { dawn: 7, noon: 12, sunset: 18, night: 0 };
const WEATHER = [
  { label: "晴朗", cloud: 0.08, fog: 0.05, snow: 0.04, wind: 0.15 },
  { label: "薄云", cloud: 0.48, fog: 0.12, snow: 0.1, wind: 0.3 },
  { label: "低云雾", cloud: 0.74, fog: 0.78, snow: 0.18, wind: 0.4 },
  { label: "风雪", cloud: 0.95, fog: 0.62, snow: 1, wind: 0.95 },
];
export function environmentState(seed, elapsed, x, z, startTime = "dawn") {
  const hour = ((START_TIMES[startTime] ?? 7) + elapsed / 60) % 24;
  const cycle = Math.floor(elapsed / 150),
    t = smooth((elapsed % 150) / 60);
  const a =
    WEATHER[cycle === 0 ? 0 : Math.floor(hash2(cycle - 1, 93, seed) * 4)];
  const b = WEATHER[Math.floor(hash2(cycle, 93, seed) * 4)];
  const env = { hour, label: t < 0.5 ? a.label : b.label, cycle, startTime };
  for (const key of ["cloud", "fog", "snow", "wind"])
    env[key] = a[key] + (b[key] - a[key]) * t;
  // Spatial modulation is smooth, so crossing a biome boundary cannot pop the fog.
  env.fog = Math.min(0.9, env.fog + 0.06 * (1 + Math.sin(x / 800 + z / 670)));
  env.region = regionAt(x, z, seed).label;
  env.sunAltitude = Math.sin(((hour - 6) / 24) * Math.PI * 2);
  env.daylight = smooth((env.sunAltitude + 0.12) / 0.35);
  return env;
}
