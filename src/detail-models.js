import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { makeSurface } from "./materials.js";

const shapes = new Map(),
  mats = new Map(),
  mountains = new Map(),
  treeCache = new Map();
const geo = (name, create) => {
  if (!shapes.has(name)) {
    const g = create();
    g.userData.sharedModelResource = true;
    shapes.set(name, g);
  }
  return shapes.get(name);
};
const mat = (name, color, opts = {}) => {
  if (!mats.has(name)) mats.set(name, makeSurface(name, color, opts));
  return mats.get(name);
};
const sphere = () => geo("smooth", () => new THREE.SphereGeometry(1, 20, 14));
const box = () => geo("box", () => new THREE.BoxGeometry(1, 1, 1));
const cylinder = () =>
  geo("cylinder", () => new THREE.CylinderGeometry(1, 1, 1, 12));
const snow = () => mat("snow-detailed", 0xe4eef4, { roughness: 0.88 });
const dark = () => mat("gear-graphite", 0x111b22, { roughness: 0.65 });
function piece(
  root,
  geometry,
  material,
  p = [0, 0, 0],
  s = [1, 1, 1],
  r = [0, 0, 0],
) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...p);
  mesh.scale.set(...s);
  mesh.rotation.set(...r);
  mesh.castShadow = mesh.receiveShadow = true;
  root.add(mesh);
  return mesh;
}
function rod(root, material, a, b, r1 = 0.07, r2 = r1) {
  const start = new THREE.Vector3(...a),
    end = new THREE.Vector3(...b),
    v = end.clone().sub(start);
  const shape = geo(
    `taper-${r1}-${r2}`,
    () => new THREE.CylinderGeometry(r2, r1, 1, 10),
  );
  const mesh = piece(
    root,
    shape,
    material,
    start.add(end).multiplyScalar(0.5).toArray(),
    [1, v.length(), 1],
  );
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize());
  return mesh;
}
const rand = (seed) => {
  let n = seed >>> 0;
  return () => {
    n = Math.imul(n, 1664525) + 1013904223;
    return (n >>> 0) / 4294967296;
  };
};

export function createDetailedSkier(color = 0xee5931) {
  const root = new THREE.Group();
  root.name = "Alpine freerider";
  const jacket = mat(`jacket:${color}`, color, { roughness: 0.79 });
  const black = dark(),
    metal = mat("gear-metal", 0xb9c5cc, { metalness: 0.92, roughness: 0.27 });
  const coat = mat("ski-coat", 0xdd552f, {
    roughness: 0.26,
    metalness: 0.1,
    clearcoat: 0.9,
    clearcoatRoughness: 0.2,
  });
  const glass = mat("goggle-glass", 0xe4a75e, {
    metalness: 0.92,
    roughness: 0.08,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
  });
  const seam = mat("gear-seam", 0x343f46, { roughness: 0.9 });
  const leftSki = new THREE.Group(),
    rightSki = new THREE.Group();
  [leftSki, rightSki].forEach((ski, i) => {
    root.add(ski);
    ski.position.x = i ? 0.19 : -0.19;
    const g = geo("freeride-ski", () => {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.03, 0.95),
        new THREE.Vector3(0, 0, 0.4),
        new THREE.Vector3(0, 0, -0.7),
        new THREE.Vector3(0, 0.13, -1.08),
      ]);
      const shape = new THREE.Shape();
      shape.moveTo(-0.1, -0.022);
      shape.lineTo(0.1, -0.022);
      shape.lineTo(0.1, 0.022);
      shape.lineTo(-0.1, 0.022);
      shape.closePath();
      return new THREE.ExtrudeGeometry(shape, {
        steps: 20,
        bevelEnabled: false,
        extrudePath: curve,
      });
    });
    piece(ski, g, coat);
    piece(ski, box(), black, [0, 0.12, 0.01], [0.2, 0.12, 0.44]);
    piece(ski, box(), metal, [0, 0.2, -0.15], [0.22, 0.08, 0.12]);
    piece(ski, box(), snow(), [0, 0.044, -0.52], [0.055, 0.012, 0.28]);
  });
  for (const sign of [-1, 1]) {
    const x = sign * 0.17;
    piece(root, box(), black, [x, 0.29, -0.03], [0.225, 0.28, 0.36]);
    for (let i = 0; i < 3; i++)
      piece(
        root,
        box(),
        metal,
        [x, 0.22 + i * 0.07, -0.215],
        [0.17, 0.019, 0.018],
      );
    rod(root, black, [x, 0.4, 0.02], [sign * 0.23, 0.79, -0.17], 0.115, 0.11);
    piece(
      root,
      sphere(),
      black,
      [sign * 0.23, 0.79, -0.17],
      [0.125, 0.13, 0.14],
    );
    rod(
      root,
      black,
      [sign * 0.23, 0.79, -0.17],
      [sign * 0.18, 1.08, 0.06],
      0.14,
      0.15,
    );
    piece(
      root,
      box(),
      seam,
      [sign * 0.28, 0.91, -0.1],
      [0.03, 0.2, 0.15],
      [0, 0, sign * 0.1],
    );
  }
  const torso = new THREE.Group();
  torso.position.set(0, 1.32, 0.015);
  torso.rotation.x = -0.09;
  root.add(torso);
  piece(torso, sphere(), jacket, [0, 0, 0], [0.31, 0.34, 0.21]);
  piece(torso, box(), black, [0, -0.27, 0], [0.43, 0.085, 0.35]);
  piece(torso, box(), seam, [0, 0.04, -0.208], [0.017, 0.47, 0.013]);
  for (const sign of [-1, 1])
    piece(
      torso,
      box(),
      seam,
      [sign * 0.19, -0.075, -0.16],
      [0.11, 0.016, 0.02],
      [0, 0, sign * 0.5],
    );
  piece(torso, box(), snow(), [-0.13, 0.18, -0.18], [0.075, 0.046, 0.014]);
  const pack = mat("pack-fabric", 0x263839, { roughness: 0.86 });
  piece(torso, sphere(), pack, [0, 0, 0.24], [0.235, 0.28, 0.13]);
  for (const x of [-0.15, 0.15])
    piece(
      torso,
      box(),
      black,
      [x, 0.04, -0.172],
      [0.038, 0.47, 0.04],
      [0, 0, x * 0.65],
    );
  const head = new THREE.Group();
  head.position.set(0, 1.77, -0.055);
  head.scale.setScalar(0.78);
  root.add(head);
  piece(head, sphere(), black, [0, -0.075, 0.005], [0.157, 0.185, 0.16]);
  piece(
    head,
    sphere(),
    mat("helmet-coat", 0x303a3d, { roughness: 0.32, metalness: 0.24 }),
    [0, 0.025, 0.012],
    [0.19, 0.22, 0.195],
  );
  piece(
    head,
    box(),
    black,
    [0, 0.013, -0.177],
    [0.348, 0.142, 0.1],
    [0.12, 0, 0],
  );
  piece(head, sphere(), glass, [0, 0.023, -0.208], [0.157, 0.062, 0.065]);
  for (const x of [-0.07, 0, 0.07])
    piece(
      head,
      box(),
      black,
      [x, 0.193, 0.015],
      [0.025, 0.009, 0.1],
      [-0.22, 0, 0],
    );
  const scarf = new THREE.Group();
  scarf.position.set(0, 1.56, 0.015);
  root.add(scarf);
  piece(scarf, sphere(), black, [0, 0, 0], [0.14, 0.1, 0.14]);
  const arms = [-1, 1].map((sign) => {
    const group = new THREE.Group();
    group.position.set(sign * 0.26, 1.51, 0);
    root.add(group);
    rod(group, jacket, [0, 0, 0], [sign * 0.11, -0.22, -0.04], 0.102, 0.087);
    piece(
      group,
      sphere(),
      jacket,
      [sign * 0.11, -0.22, -0.04],
      [0.09, 0.095, 0.09],
    );
    rod(
      group,
      jacket,
      [sign * 0.11, -0.22, -0.04],
      [sign * 0.13, -0.32, -0.25],
      0.087,
      0.067,
    );
    piece(
      group,
      sphere(),
      black,
      [sign * 0.135, -0.35, -0.28],
      [0.069, 0.091, 0.076],
    );
    rod(
      group,
      metal,
      [sign * 0.14, -0.3, -0.28],
      [sign * 0.3, -1.42, 0.3],
      0.012,
    );
    rod(
      group,
      black,
      [sign * 0.14, -0.27, -0.3],
      [sign * 0.16, -0.43, -0.23],
      0.027,
    );
    piece(
      group,
      geo("pole-basket", () => new THREE.TorusGeometry(0.05, 0.009, 6, 14)),
      black,
      [sign * 0.286, -1.32, 0.245],
      [1, 1, 1],
      [Math.PI / 2, 0, 0],
    );
    return group;
  });
  root.userData = {
    torso,
    head,
    scarf,
    leftArm: arms[0],
    rightArm: arms[1],
    leftSki,
    rightSki,
  };
  return root;
}

export function createDetailedTree(seed = 3, lod = 0) {
  const cacheKey = `${seed % 4}:${lod}`;
  if (treeCache.has(cacheKey)) return treeCache.get(cacheKey).clone();
  const random = rand(seed + 50),
    root = new THREE.Group();
  root.name = "Alpine spruce";
  const bark = mat("bark-detailed", 0x574b40),
    leaf = mat("foliage-pine", 0x35483b, {
      roughness: 0.9,
      side: THREE.DoubleSide,
      alphaTest: 0.42,
    });
  const trunkParts = [],
    leafParts = [],
    snowParts = [];
  const temporary = new THREE.Group();
  rod(temporary, bark, [0, 0, 0], [0.07, 6.75, 0], 0.17, 0.025);
  const layers = lod === 0 ? 10 : 6;
  for (let level = 0; level < layers; level++) {
    const y = 1 + (level / (layers - 1)) * 5.35,
      radius = (6.8 - y) * 0.245 + 0.18;
    const count = lod === 0 ? 7 : 5;
    for (let b = 0; b < count; b++) {
      const a = (b / count) * Math.PI * 2 + level * 1.79 + random() * 0.4,
        len = radius * (0.75 + random() * 0.4);
      const end = [
        Math.cos(a) * len,
        y - 0.25 - random() * 0.2,
        Math.sin(a) * len,
      ];
      if (lod === 0) rod(temporary, bark, [0, y, 0], end, 0.025, 0.007);
      const card = piece(
        temporary,
        geo("pine-card", () => {
          // The source atlas has opaque bark padding outside the needle island.
          // Trace that island instead of sampling the whole rectangular atlas cell.
          const outline = [
            [4, 4],
            [204, 4],
            [226, 58],
            [239, 170],
            [211, 282],
            [169, 447],
            [119, 449],
            [49, 418],
            [4, 280],
          ];
          const shape = new THREE.Shape(
            outline.map(
              ([x, y]) => new THREE.Vector2(x / 256 - 0.5, 0.5 - y / 470),
            ),
          );
          const g = new THREE.ShapeGeometry(shape);
          const uv = g.attributes.uv,
            p = g.attributes.position;
          for (let i = 0; i < uv.count; i++)
            uv.setXY(
              i,
              (p.getX(i) + 0.5) * 0.25,
              1 - ((0.5 - p.getY(i)) * 470) / 1024,
            );
          return g;
        }),
        leaf,
        [end[0] * 0.65, y - 0.14, end[2] * 0.65],
        [len * 0.82, 0.7 + len * 0.52, 1],
        [-0.65, a, Math.PI / 2],
      );
      card.rotation.z += (random() - 0.5) * 0.35;
      if (lod === 0) {
        const second = card.clone();
        second.rotation.y += Math.PI / 2;
        temporary.add(second);
      }
      if (b % 2 === 0)
        piece(
          temporary,
          geo("snow-branch", () => new THREE.IcosahedronGeometry(1, 1)),
          snow(),
          [end[0] * 0.58, y + 0.025, end[2] * 0.58],
          [len * 0.5, 0.095, len * 0.21],
          [0, -a, 0],
        );
    }
  }
  temporary.updateMatrixWorld(true);
  temporary.traverse((obj) => {
    if (obj.isMesh) {
      const g = obj.geometry.clone().applyMatrix4(obj.matrixWorld);
      g.deleteAttribute("normal");
      g.computeVertexNormals();
      const dest =
        obj.material === bark
          ? trunkParts
          : obj.material === leaf
            ? leafParts
            : snowParts;
      dest.push(g);
    }
  });
  for (const [parts, surface] of [
    [trunkParts, bark],
    [leafParts, leaf],
    [snowParts, snow()],
  ]) {
    // Match attributes before merging primitives with and without UVs.
    for (const g of parts)
      if (!g.attributes.uv)
        g.setAttribute(
          "uv",
          new THREE.BufferAttribute(
            new Float32Array(g.attributes.position.count * 2),
            2,
          ),
        );
    const expanded = parts.map((g) => (g.index ? g.toNonIndexed() : g));
    const g = mergeGeometries(expanded);
    g.userData.sharedModelResource = true;
    piece(root, g, surface);
    parts.forEach((g) => g.dispose());
    expanded.forEach((g) => {
      if (!parts.includes(g)) g.dispose();
    });
  }
  treeCache.set(cacheKey, root);
  return root;
}

export function createDetailedMountain(seed = 0) {
  if (!mountains.has(seed)) {
    const random = rand(seed + 15);
    const nx = 100,
      nz = 36,
      positions = [],
      uv = [],
      indices = [];
    const center = random() * 0.7 - 0.35,
      sharp = 0.75 + random() * 0.2;
    for (let j = 0; j <= nz; j++)
      for (let i = 0; i <= nx; i++) {
        const x = (i / nx - 0.5) * 190,
          z = (j / nz - 0.5) * 100;
        const ridge = Math.max(0, 1 - Math.abs(x / 95 - center));
        const wave =
          Math.sin(x * 0.085 + seed) * 11 +
          Math.sin(x * 0.23 + seed * 3) * 6 +
          Math.sin(x * 0.49 - z * 0.13) * 2.4;
        const cross = Math.max(0, 1 - Math.abs(z / 50));
        const h =
          Math.pow(ridge, sharp) * Math.pow(cross, 0.6) * (65 + wave) +
          Math.sin(x * 0.13 + z * 0.14) * 3 * cross -
          Math.pow(Math.abs(Math.sin(x * 0.19 + z * 0.045)), 6) * 6 * cross;
        positions.push(x, h, z);
        uv.push(i / 7, j / 4);
        if (i < nx && j < nz) {
          const a = j * (nx + 1) + i,
            b = a + nx + 1;
          indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(indices);
    g.computeVertexNormals();
    g.userData.sharedModelResource = true;
    mountains.set(seed, g);
  }
  const root = new THREE.Group();
  root.name = "Glaciated ridgeline";
  piece(
    root,
    mountains.get(seed),
    mat("mountain", 0xffffff, { roughness: 0.94 }),
  );
  return root;
}

export function createDetailedRock(seed = 0) {
  const root = new THREE.Group();
  root.name = "Granite boulder";
  const g = geo(`rock-${seed % 4}`, () => {
    const geometry = new THREE.IcosahedronGeometry(1, 3),
      p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        y = p.getY(i),
        z = p.getZ(i),
        n =
          1 + Math.sin(x * 9 + z * 7) * 0.09 + Math.sin(y * 13 + z * 5) * 0.07;
      p.setXYZ(i, x * n, y * n, z * n);
    }
    geometry.computeVertexNormals();
    return geometry;
  });
  piece(
    root,
    g,
    mat("stone", 0xffffff, { roughness: 0.92 }),
    [0, 0.47, 0],
    [1.05, 0.68, 0.9],
    [0, seed * 1.7, 0.12],
  );
  return root;
}
