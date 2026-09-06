import {
  mountainHeight,
  sampleTerrain,
  terrainColor,
} from "./mountain-field.js";
export function patchKey(p) {
  return `${p.x}:${p.z}:${p.size}`;
}
export function selectPatches(x, z, quality = "high") {
  const result = [],
    root = 1024,
    min = quality === "low" ? 128 : 64;
  function split(px, pz, size) {
    const dx = Math.max(px - x, 0, x - px - size),
      dz = Math.max(pz - z, 0, z - pz - size);
    if (size > min && Math.hypot(dx, dz) < size * 1.25) {
      const h = size / 2;
      for (const [ox, oz] of [
        [0, 0],
        [h, 0],
        [0, h],
        [h, h],
      ])
        split(px + ox, pz + oz, h);
    } else result.push({ x: px, z: pz, size });
  }
  const cx = Math.floor(x / root),
    cz = Math.floor(z / root);
  for (let j = cz - 1; j <= cz + 1; j++)
    for (let i = cx - 1; i <= cx + 1; i++) split(i * root, j * root, root);
  return result.sort(
    (a, b) =>
      Math.hypot(a.x + a.size / 2 - x, a.z + a.size / 2 - z) -
      Math.hypot(b.x + b.size / 2 - x, b.z + b.size / 2 - z),
  );
}
export function generatePatch({ x, z, size }, seed, segments = 32) {
  const base = mountainHeight(x, z, seed),
    positions = [],
    normals = [],
    colors = [],
    uv = [],
    indices = [];
  function vertex(px, pz, skirt = 0) {
    const s = sampleTerrain(px, pz, seed);
    positions.push(px - x, s.height - base - skirt, pz - z);
    normals.push(s.normal.x, s.normal.y, s.normal.z);
    colors.push(...terrainColor(s));
    uv.push(px / 3, pz / 3);
  }
  for (let j = 0; j <= segments; j++)
    for (let i = 0; i <= segments; i++) {
      vertex(x + (i / segments) * size, z + (j / segments) * size);
      if (i < segments && j < segments) {
        const a = j * (segments + 1) + i,
          b = a + segments + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  // Downward skirts cover T-junctions between unequal LODs without moving the snow surface.
  for (let side = 0; side < 4; side++) {
    const border = [];
    for (let i = 0; i <= segments; i++)
      border.push(
        side === 0
          ? i
          : side === 1
            ? i * (segments + 1) + segments
            : side === 2
              ? segments * (segments + 1) + segments - i
              : (segments - i) * (segments + 1),
      );
    for (let i = 0; i <= segments; i++) {
      const a = border[i],
        n = positions.length / 3;
      vertex(
        x + positions[a * 3],
        z + positions[a * 3 + 2],
        Math.max(8, size * 0.08),
      );
      if (i) {
        const b = border[i - 1];
        indices.push(b, n - 1, a, a, n - 1, n);
      }
    }
  }
  return {
    base,
    position: new Float32Array(positions),
    normal: new Float32Array(normals),
    color: new Float32Array(colors),
    uv: new Float32Array(uv),
    index: new Uint16Array(indices),
  };
}
