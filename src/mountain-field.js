// Pure, deterministic world data. Shared by the physics thread and terrain worker.
export const REGION_SIZE = 900;
export const BIOMES = [
  {
    id: "powder",
    label: "高山粉雪盆地",
    surface: "powder",
    trees: 0.16,
    slope: 0.34,
  },
  {
    id: "forest",
    label: "针叶林坡",
    surface: "snow",
    trees: 0.85,
    slope: 0.21,
  },
  {
    id: "couloir",
    label: "陡峭雪槽",
    surface: "crust",
    trees: 0.025,
    slope: 0.63,
  },
  { id: "glacier", label: "冰川地带", surface: "ice", trees: 0, slope: 0.27 },
  {
    id: "ridge",
    label: "风蚀山脊",
    surface: "crust",
    trees: 0.035,
    slope: 0.43,
  },
  {
    id: "canyon",
    label: "峡谷台地",
    surface: "snow",
    trees: 0.08,
    slope: 0.32,
  },
  {
    id: "lake",
    label: "冰湖与雪原",
    surface: "ice",
    trees: 0.015,
    slope: 0.015,
  },
  {
    id: "village",
    label: "山间聚落谷地",
    surface: "snow",
    trees: 0.3,
    slope: 0.13,
  },
];
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const smooth = (x) => {
  x = clamp(x, 0, 1);
  return x * x * x * (x * (x * 6 - 15) + 10);
};
export function hash2(x, z, seed = 20260905) {
  let n =
    Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ (seed >>> 0);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
function noise(x, z, seed) {
  const ix = Math.floor(x),
    iz = Math.floor(z),
    a = smooth(x - ix),
    b = smooth(z - iz);
  const p = hash2(ix, iz, seed),
    q = hash2(ix + 1, iz, seed);
  return (
    (p + (q - p) * a) * (1 - b) +
    (hash2(ix, iz + 1, seed) * (1 - a) + hash2(ix + 1, iz + 1, seed) * a) * b
  );
}
export function regionInfo(cx, cz, seed = 20260905) {
  const index = cx === 0 && cz === 0 ? 0 : Math.floor(hash2(cx, cz, seed) * 8);
  return {
    ...BIOMES[index],
    index,
    cx,
    cz,
    x: cx * REGION_SIZE,
    z: cz * REGION_SIZE,
  };
}
function weightsAt(x, z, seed) {
  // Domain warp removes rectilinear biome boundaries; quintic weights preserve tangents.
  const wx = x + Math.sin(z / 620) * 90,
    wz = z + Math.sin(x / 710) * 85;
  const cx = Math.floor(wx / REGION_SIZE),
    cz = Math.floor(wz / REGION_SIZE);
  const tx = smooth(wx / REGION_SIZE - cx),
    tz = smooth(wz / REGION_SIZE - cz);
  return [
    [cx, cz, (1 - tx) * (1 - tz)],
    [cx + 1, cz, tx * (1 - tz)],
    [cx, cz + 1, (1 - tx) * tz],
    [cx + 1, cz + 1, tx * tz],
  ];
}
export function regionAt(x, z, seed = 20260905) {
  const w = weightsAt(x, z, seed).sort((a, b) => b[2] - a[2])[0];
  return regionInfo(w[0], w[1], seed);
}
function macro(x, z, seed) {
  return z * 0.24 + (noise(x / 1500, z / 1800, seed + 3) - 0.5) * 500;
}
function regionalHeight(x, z, cx, cz, seed) {
  const r = regionInfo(cx, cz, seed),
    dx = x - r.x,
    dz = z - r.z;
  const phase = hash2(cx, cz, seed + 17) * 6.28;
  const bend = dx + Math.sin(dz / 230 + phase) * 45;
  const base = macro(r.x, r.z, seed) + r.slope * dz;
  const wave = Math.sin(dx * 0.008 + phase) * Math.sin(dz * 0.012 + phase);
  switch (r.id) {
    case "powder":
      return base + 28 * Math.sin(dx / 190) + 13 * Math.sin(dz / 75) + wave * 3;
    case "forest":
      return base + Math.sin(dx / 120) * 14 + Math.sin(dz / 65) * 7 + wave * 2;
    case "couloir":
      return (
        base + 100 * (1 - Math.exp(-((bend / 85) ** 2))) + Math.sin(dz / 43) * 9
      );
    case "glacier":
      return (
        base +
        14 * Math.sin(dx / 95) -
        25 * Math.exp(-((Math.sin((dz + dx * 0.32) / 95) / 0.13) ** 2)) +
        wave * 2
      );
    case "ridge":
      return (
        base +
        110 * Math.exp(-((bend / 100) ** 2)) +
        18 * Math.sin(dz / 54) +
        5 * Math.sin(dx / 16) * Math.sin(dz / 28)
      );
    case "canyon":
      return (
        base +
        60 * Math.tanh(Math.sin(dz / 93) * 2.6) +
        65 * (1 - Math.exp(-((bend / 135) ** 2)))
      );
    case "lake":
      return base + Math.sin(dx / 330) * 1.5 + Math.sin(dz / 310) * 1.1;
    default:
      return (
        base + Math.sin(dx / 150) * 9 + Math.sin(dz / 105) * 5 + wave * 1.5
      );
  }
}
export function mountainHeight(x, z, seed = 20260905) {
  let h = 0;
  for (const [cx, cz, w] of weightsAt(x, z, seed))
    if (w > 0.0000001) h += regionalHeight(x, z, cx, cz, seed) * w;
  // Compact-support peaks form real, traversable silhouettes in every direction.
  // Neighbouring regions contribute to the same field, never camera-facing props.
  const ix = Math.floor(x / REGION_SIZE),
    iz = Math.floor(z / REGION_SIZE);
  for (let cz = iz - 1; cz <= iz + 1; cz++)
    for (let cx = ix - 1; cx <= ix + 1; cx++) {
      const px =
        cx * REGION_SIZE + (hash2(cx, cz, seed + 301) > 0.5 ? 1 : -1) * 350;
      const pz = cz * REGION_SIZE + (hash2(cx, cz, seed + 302) - 0.5) * 620;
      const radius = 380 + hash2(cx, cz, seed + 303) * 100;
      const r2 = ((x - px) / radius) ** 2 + ((z - pz) / radius) ** 2;
      if (r2 < 1) {
        const strength = regionInfo(cx, cz, seed).id === "lake" ? 0.42 : 1;
        const ribs =
          1 +
          0.24 *
            (Math.cos(
              Math.atan2(z - pz, x - px) * 5 + hash2(cx, cz, seed + 305) * 6.28,
            ) -
              1) *
            Math.min(1, r2 * 20);
        const erosion =
          1 +
          0.09 *
            Math.sin(x / 23 + z / 51) *
            Math.sin(z / 35 - x / 43) *
            Math.min(1, r2 * 12);
        h +=
          (330 + hash2(cx, cz, seed + 304) * 240) *
          (1 - r2) ** 2.5 *
          strength *
          ribs *
          erosion;
      }
    }
  return h;
}
export function sampleTerrain(x, z, seed = 20260905) {
  const e = 0.35,
    height = mountainHeight(x, z, seed);
  const gx =
    (mountainHeight(x + e, z, seed) - mountainHeight(x - e, z, seed)) / (2 * e);
  const gz =
    (mountainHeight(x, z + e, seed) - mountainHeight(x, z - e, seed)) / (2 * e);
  const length = Math.hypot(gx, 1, gz),
    region = regionAt(x, z, seed);
  return {
    height,
    gradient: { x: gx, z: gz },
    normal: { x: -gx / length, y: 1 / length, z: -gz / length },
    slope: (Math.atan(Math.hypot(gx, gz)) * 180) / Math.PI,
    region,
    biome: region.id,
    surface: region.surface,
  };
}
export function terrainColor(sample) {
  const ice = sample.surface === "ice",
    rock = smooth((sample.slope - 38) / 22);
  const snow = ice ? [0.43, 0.69, 0.78] : [0.86, 0.91, 0.95];
  return snow.map((c, i) => c * (1 - rock) + [0.26, 0.3, 0.33][i] * rock);
}
export function findBiome(index, seed = 20260905) {
  for (let ring = 0; ring < 20; ring++)
    for (let z = -ring; z <= ring; z++)
      for (let x = -ring; x <= ring; x++) {
        if (Math.max(Math.abs(x), Math.abs(z)) !== ring) continue;
        const region = regionInfo(x, z, seed);
        if (region.index === index) return region;
      }
}
