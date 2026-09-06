import { hash2, sampleTerrain, mountainHeight } from "./mountain-field.js";
export const ENTITY_TILE = 64;
export function generateEntities(cx, cz, seed) {
  const list = [];
  for (let i = 0; i < 18; i++) {
    const x = (cx + hash2(cx * 31 + i, cz, seed + 9)) * ENTITY_TILE;
    const z = (cz + hash2(cx, cz * 29 + i, seed + 10)) * ENTITY_TILE;
    const s = sampleTerrain(x, z, seed),
      roll = hash2(cx * 59 + i, cz * 71, seed + 11);
    if (Math.hypot(x, z) < 65 || s.slope > 46) continue;
    const density = s.region.trees * 0.65;
    let type =
      roll < 0.1
        ? "coin"
        : roll < 0.1 + density
          ? "tree"
          : roll < 0.22 + density
            ? "rock"
            : roll < 0.24 + density
              ? "log"
              : i === 0 && roll > 0.91
                ? ["shield", "magnet", "penguin"][Math.floor(roll * 30) % 3]
                : null;
    if (s.biome === "lake" && type !== "coin") type = null;
    if (s.biome === "village" && i === 0) type = "cabin";
    // Leave convex lips and their immediate landing areas clear of obstacles.
    const curve =
      mountainHeight(x, z + 5, seed) +
      mountainHeight(x, z - 5, seed) -
      2 * s.height;
    if (curve < -1 && !["coin", "shield", "magnet", "penguin"].includes(type))
      continue;
    if (!type) continue;
    const radius = { tree: 0.7, rock: 1.4, log: 1.8, cabin: 4.4 }[type] || 1;
    if (list.some((e) => Math.hypot(e.x - x, e.z - z) < e.radius + radius + 2))
      continue;
    list.push({
      id: `${seed}:${cx}:${cz}:${i}`,
      type,
      x,
      z,
      y: s.height,
      radius,
      height: { tree: 7.5, rock: 1.8, log: 0.9, cabin: 6 }[type] || 2,
      scale: 0.8 + hash2(cx + i, cz, seed + 15) * 0.6,
      rotation: hash2(cx, cz + i, seed + 16) * 6.28,
      collected: false,
    });
  }
  return list;
}
export class EntityField {
  constructor(seed) {
    this.seed = seed;
    this.tiles = new Map();
    this.collected = new Set();
  }
  update(x, z, radius = 210) {
    const cx = Math.floor(x / ENTITY_TILE),
      cz = Math.floor(z / ENTITY_TILE),
      range = Math.ceil(radius / ENTITY_TILE),
      keep = new Set();
    for (let iz = cz - range; iz <= cz + range; iz++)
      for (let ix = cx - range; ix <= cx + range; ix++) {
        const key = `${ix}:${iz}`;
        keep.add(key);
        if (!this.tiles.has(key))
          this.tiles.set(key, generateEntities(ix, iz, this.seed));
      }
    for (const key of this.tiles.keys())
      if (!keep.has(key)) this.tiles.delete(key);
    return [...this.tiles.values()]
      .flat()
      .filter(
        (e) =>
          !this.collected.has(e.id) && Math.hypot(e.x - x, e.z - z) < radius,
      );
  }
  query(x, z, radius = 8) {
    const list = [];
    for (
      let iz = Math.floor((z - radius) / ENTITY_TILE);
      iz <= Math.floor((z + radius) / ENTITY_TILE);
      iz++
    )
      for (
        let ix = Math.floor((x - radius) / ENTITY_TILE);
        ix <= Math.floor((x + radius) / ENTITY_TILE);
        ix++
      )
        for (const e of this.tiles.get(`${ix}:${iz}`) || [])
          if (!this.collected.has(e.id)) list.push(e);
    return list;
  }
  collect(entity) {
    entity.collected = true;
    this.collected.add(entity.id);
  }
}
export function segmentHitsEntity(a, b, e, extra = 0.4) {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    len = dx * dx + dz * dz;
  const t = Math.max(
    0,
    Math.min(1, len ? ((e.x - a.x) * dx + (e.z - a.z) * dz) / len : 0),
  );
  const y = a.y + (b.y - a.y) * t;
  return (
    Math.hypot(a.x + dx * t - e.x, a.z + dz * t - e.z) < e.radius + extra &&
    y < e.y + e.height &&
    y + 1.5 > e.y
  );
}
