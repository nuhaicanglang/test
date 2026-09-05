import * as THREE from 'three';

// 几何体和材质在模型之间共享，避免重复生成相同资源。
const geometryCache = new Map();
const materialCache = new Map();
const mountainCache = new Map();
const labelCache = new Map();
const UP = new THREE.Vector3(0, 1, 0);

function geometry(key, create) {
  if (!geometryCache.has(key)) {
    const result = create();
    result.userData.sharedModelResource = true;
    geometryCache.set(key, result);
  }
  return geometryCache.get(key);
}

function material(name, color, extras = {}) {
  if (!materialCache.has(name)) {
    const result = new THREE.MeshStandardMaterial({
      color, roughness: 0.78, metalness: 0, flatShading: true, ...extras,
    });
    result.userData.sharedModelResource = true;
    materialCache.set(name, result);
  }
  return materialCache.get(name);
}

const palette = {
  snow: material('snow', 0xf4fbff),
  snowShade: material('snow-shade', 0xd4e8f0),
  dark: material('dark', 0x172d40),
  navy: material('navy', 0x25445a),
  blue: material('blue', 0x37a8cc),
  mint: material('mint', 0x58c7bc),
  coral: material('coral', 0xee704d),
  yellow: material('yellow', 0xffd36d),
  wood: material('wood', 0x9a6550),
  woodLight: material('wood-light', 0xbd8662),
  bark: material('bark', 0x654638),
  pine: material('pine', 0x285e60),
  pineLight: material('pine-light', 0x3b7472),
  gold: material('gold', 0xffc84e, { metalness: 0.65, roughness: 0.24, emissive: 0x88521a, emissiveIntensity: 0.2 }),
};

const boxGeometry = () => geometry('box', () => new THREE.BoxGeometry(1, 1, 1));
const sphereGeometry = () => geometry('sphere', () => new THREE.SphereGeometry(1, 12, 8));
const icoGeometry = () => geometry('ico', () => new THREE.IcosahedronGeometry(1, 0));
const dodecaGeometry = () => geometry('dodeca', () => new THREE.DodecahedronGeometry(1, 0));
const cylinderGeometry = () => geometry('cylinder', () => new THREE.CylinderGeometry(1, 1, 1, 10));
const coneGeometry = () => geometry('cone', () => new THREE.ConeGeometry(1, 1, 9));

function part(parent, shape, surface, position = [0, 0, 0], scale = [1, 1, 1], rotation = [0, 0, 0]) {
  const object = new THREE.Mesh(shape, surface);
  object.position.set(...position);
  object.scale.set(...scale);
  object.rotation.set(...rotation);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}

function box(parent, surface, position, scale, rotation) {
  return part(parent, boxGeometry(), surface, position, scale, rotation);
}

function sphere(parent, surface, position, scale) {
  return part(parent, sphereGeometry(), surface, position, scale);
}

function beam(parent, surface, from, to, radius = 0.06) {
  const start = new THREE.Vector3(...from);
  const end = new THREE.Vector3(...to);
  const vector = end.clone().sub(start);
  const object = part(parent, cylinderGeometry(), surface);
  object.position.copy(start.add(end).multiplyScalar(0.5));
  object.scale.set(radius, vector.length(), radius);
  object.quaternion.setFromUnitVectors(UP, vector.normalize());
  return object;
}

function torus(parent, surface, radius, thickness, position = [0, 0, 0], rotation = [0, 0, 0]) {
  return part(parent, geometry(`torus:${radius}:${thickness}`, () => new THREE.TorusGeometry(radius, thickness, 6, 24)), surface, position, [1, 1, 1], rotation);
}

function rng(seed = 0) {
  let value = (Number(seed) * 2654435761) >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = Math.imul(value ^ (value >>> 15), 1 | value);
    next ^= next + Math.imul(next ^ (next >>> 7), 61 | next);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function extrudedShape(key, shape, depth = 0.08, bevel = 0.02) {
  return geometry(key, () => {
    const result = new THREE.ExtrudeGeometry(shape, {
      depth, bevelEnabled: bevel > 0, bevelThickness: bevel,
      bevelSize: bevel, bevelSegments: 1, steps: 1, curveSegments: 12,
    });
    result.translate(0, 0, -depth / 2);
    return result;
  });
}

function ski(parent, x, surface) {
  const root = new THREE.Group();
  root.position.set(x, 0, 0);
  parent.add(root);
  const shape = new THREE.Shape();
  shape.moveTo(-0.105, -0.9);
  shape.lineTo(-0.105, 0.78);
  shape.quadraticCurveTo(-0.105, 1.03, 0, 1.09);
  shape.quadraticCurveTo(0.105, 1.03, 0.105, 0.78);
  shape.lineTo(0.105, -0.9);
  shape.quadraticCurveTo(0, -0.98, -0.105, -0.9);
  part(root, extrudedShape('ski-profile', shape, 0.055, 0.012), surface, [0, 0.0395, 0], [1, 1, 1], [-Math.PI / 2, 0, 0]);
  box(root, palette.snow, [0, 0.098, -0.48], [0.055, 0.012, 0.49]);
  box(root, palette.dark, [0, 0.145, 0.02], [0.19, 0.12, 0.46]);
  box(root, palette.yellow, [0, 0.21, -0.03], [0.19, 0.035, 0.085]);
  return root;
}

export function createSkier(color = 0xf26943) {
  const root = new THREE.Group();
  root.name = 'Skier';
  const jacket = material(`jacket:${color}`, color);
  const skin = material('skin', 0xffd4b5);
  const glass = material('goggle-glass', 0x9ae9eb, { metalness: 0.72, roughness: 0.13, emissive: 0x316079, emissiveIntensity: 0.12 });
  const leftSki = ski(root, -0.205, palette.mint);
  const rightSki = ski(root, 0.205, palette.mint);

  // 小腿向后、膝盖向前，让静止造型也有滑行的重心。
  for (const sign of [-1, 1]) {
    const x = sign * 0.205;
    beam(root, palette.navy, [x, 0.32, 0.02], [x, 0.61, -0.17], 0.12);
    beam(root, palette.dark, [x, 0.61, -0.17], [sign * 0.17, 0.9, 0.04], 0.14);
    sphere(root, palette.navy, [x, 0.61, -0.17], [0.135, 0.14, 0.13]);
    box(root, palette.dark, [x, 0.27, -0.035], [0.245, 0.23, 0.4]);
    box(root, palette.snow, [x, 0.29, -0.24], [0.21, 0.08, 0.026]);
  }

  const torso = new THREE.Group();
  torso.position.set(0, 1.2, 0.02);
  root.add(torso);
  sphere(torso, jacket, [0, 0, 0], [0.37, 0.4, 0.265]);
  box(torso, palette.navy, [0, -0.32, 0], [0.49, 0.09, 0.39]);
  box(torso, palette.snow, [0, 0.025, -0.266], [0.026, 0.53, 0.018]);
  box(torso, palette.yellow, [-0.175, 0.15, -0.238], [0.115, 0.09, 0.03], [0, 0, -0.12]);
  box(torso, palette.dark, [0.19, -0.15, -0.227], [0.12, 0.02, 0.015], [0, 0, 0.16]);

  const scarf = new THREE.Group();
  scarf.position.set(0, 1.53, 0.01);
  root.add(scarf);
  part(scarf, cylinderGeometry(), palette.mint, [0, 0, 0], [0.22, 0.13, 0.205]);
  box(scarf, palette.mint, [0.14, -0.04, 0.34], [0.16, 0.07, 0.54], [-0.22, -0.2, 0]);
  box(scarf, palette.snow, [0.19, 0.015, 0.565], [0.13, 0.025, 0.05], [-0.22, -0.2, 0]);

  const head = new THREE.Group();
  head.position.set(0, 1.8, -0.045);
  root.add(head);
  sphere(head, skin, [0, 0, 0], [0.29, 0.31, 0.27]);
  part(head, geometry('hat-dome', () => new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)), palette.navy, [0, 0.08, 0.005], [0.32, 0.31, 0.295]);
  part(head, cylinderGeometry(), palette.yellow, [0, 0.09, 0.005], [0.318, 0.095, 0.294]);
  sphere(head, palette.snow, [0, 0.41, 0.012], [0.095, 0.095, 0.095]);
  box(head, palette.dark, [0, 0.03, -0.241], [0.535, 0.183, 0.125]);
  box(head, glass, [0, 0.034, -0.315], [0.453, 0.132, 0.045]);
  box(head, palette.snow, [-0.1, 0.063, -0.341], [0.078, 0.018, 0.008], [0, 0, -0.32]);
  box(head, palette.snow, [0.1, 0.055, -0.341], [0.15, 0.014, 0.008], [0, 0, -0.32]);
  sphere(head, skin, [0, -0.093, -0.28], [0.06, 0.06, 0.063]);
  box(head, material('smile', 0xad634f), [0, -0.174, -0.226], [0.071, 0.017, 0.016]);

  const arms = [-1, 1].map((sign) => {
    const arm = new THREE.Group();
    arm.position.set(sign * 0.3, 1.43, 0.01);
    root.add(arm);
    beam(arm, jacket, [0, 0, 0], [sign * 0.14, -0.28, -0.1], 0.12);
    beam(arm, jacket, [sign * 0.14, -0.28, -0.1], [sign * 0.19, -0.39, -0.31], 0.105);
    sphere(arm, palette.dark, [sign * 0.2, -0.4, -0.32], [0.105, 0.11, 0.11]);
    beam(arm, palette.snowShade, [sign * 0.21, -0.39, -0.32], [sign * 0.4, -1.35, 0.44], 0.024);
    beam(arm, palette.dark, [sign * 0.205, -0.33, -0.36], [sign * 0.225, -0.48, -0.24], 0.046);
    torus(arm, palette.dark, 0.079, 0.019, [sign * 0.384, -1.27, 0.377], [Math.PI / 2, 0, 0]);
    return arm;
  });
  root.userData = { torso, head, scarf, leftArm: arms[0], rightArm: arms[1], leftSki, rightSki };
  return root;
}

export function createTree(seed = 0) {
  const random = rng(seed);
  const root = new THREE.Group();
  root.name = 'Snow pine';
  const size = 0.87 + random() * 0.3;
  root.scale.set(size * (0.91 + random() * 0.15), size, size * (0.91 + random() * 0.15));
  root.rotation.y = random() * Math.PI * 2;
  part(root, cylinderGeometry(), palette.bark, [0, 0.7, 0], [0.21, 1.4, 0.21]);
  part(root, dodecaGeometry(), palette.snow, [0, 0.1, 0], [0.62, 0.2, 0.59]);
  const levels = [[1.9, 1.68, 2.55], [3.06, 1.31, 2.3], [4.2, 0.92, 2.2]];
  levels.forEach(([y, radius, height], index) => {
    const angle = index * 0.4;
    part(root, coneGeometry(), index === 1 ? palette.pineLight : palette.pine, [0, y, 0], [radius, height, radius], [0, angle, 0]);
    part(root, coneGeometry(), palette.snow, [0, y + height * 0.125 + 0.025, 0], [radius * 0.79, height * 0.79, radius * 0.79], [0, angle, 0]);
  });
  return root;
}

export function createRock(seed = 0) {
  const random = rng(seed);
  const root = new THREE.Group();
  root.name = 'Snow rock';
  root.rotation.y = random() * Math.PI * 2;
  const width = 1.12 + random() * 0.42;
  const stone = material('stone', 0x758b99);
  part(root, dodecaGeometry(), stone, [0, 0.47, 0], [width, 0.66, 0.97], [0, 0.27, 0.09]);
  part(root, dodecaGeometry(), palette.snow, [-0.07, 0.84, 0.01], [width * 0.89, 0.35, 0.88], [0, 0.27, 0.09]);
  part(root, icoGeometry(), stone, [width * 0.78, 0.17, 0.2], [0.37, 0.3, 0.42]);
  return root;
}

export function createLog() {
  const root = new THREE.Group();
  root.name = 'Fallen log';
  part(root, cylinderGeometry(), palette.bark, [0, 0.42, 0], [0.41, 4, 0.41], [0, 0, Math.PI / 2]);
  for (let i = 0; i < 7; i += 1) {
    const angle = i / 7 * Math.PI * 2;
    beam(root, palette.wood, [-1.96, 0.42 + Math.sin(angle) * 0.39, Math.cos(angle) * 0.39], [1.96, 0.42 + Math.sin(angle) * 0.39, Math.cos(angle) * 0.39], 0.024);
  }
  for (const sign of [-1, 1]) {
    part(root, cylinderGeometry(), palette.woodLight, [sign * 2.009, 0.42, 0], [0.356, 0.025, 0.356], [0, 0, Math.PI / 2]);
    torus(root, palette.bark, 0.22, 0.012, [sign * 2.027, 0.42, 0], [0, Math.PI / 2, 0]);
    torus(root, palette.bark, 0.105, 0.01, [sign * 2.029, 0.42, 0], [0, Math.PI / 2, 0]);
  }
  box(root, palette.snow, [0, 0.793, -0.015], [3.82, 0.14, 0.46]);
  sphere(root, palette.snow, [-1.9, 0.79, -0.015], [0.22, 0.08, 0.23]);
  sphere(root, palette.snow, [1.9, 0.79, -0.015], [0.22, 0.08, 0.23]);
  beam(root, palette.bark, [0.72, 0.45, 0.1], [1, 0.88, 0.4], 0.13);
  return root;
}

export function createRamp() {
  const root = new THREE.Group();
  root.name = 'Jump ramp';
  const wedge = geometry('ramp-wedge', () => {
    const result = new THREE.BufferGeometry();
    result.setAttribute('position', new THREE.Float32BufferAttribute([
      -2, 0.02, -3, 2, 0.02, -3, -2, 0.02, 3, 2, 0.02, 3,
      -2, 1.5, -3, 2, 1.5, -3, -2, 0.1, 3, 2, 0.1, 3,
    ], 3));
    result.setIndex([0, 4, 5, 0, 5, 1, 2, 3, 7, 2, 7, 6, 0, 2, 6, 0, 6, 4, 1, 5, 7, 1, 7, 3, 4, 6, 7, 4, 7, 5, 0, 1, 3, 0, 3, 2]);
    const flat = result.toNonIndexed();
    flat.computeVertexNormals();
    result.dispose();
    return flat;
  });
  part(root, wedge, palette.blue);
  const angle = Math.atan2(1.4, 6);
  const deckLength = Math.hypot(6, 1.4);
  box(root, palette.snow, [0, 0.85, 0], [3.9, 0.09, deckLength], [angle, 0, 0]);
  box(root, palette.mint, [0, 0.901, 0], [0.84, 0.014, deckLength], [angle, 0, 0]);
  for (const sign of [-1, 1]) {
    box(root, palette.yellow, [sign * 1.79, 0.928, 0], [0.085, 0.075, deckLength], [angle, 0, 0]);
    box(root, palette.navy, [sign * 2.016, 0.61, -1.6], [0.025, 0.1, 1.45], [0.32, 0, 0]);
  }
  const arrowShape = new THREE.Shape();
  arrowShape.moveTo(0, 0.58);
  arrowShape.lineTo(-0.46, -0.07);
  arrowShape.lineTo(-0.19, -0.07);
  arrowShape.lineTo(-0.19, -0.48);
  arrowShape.lineTo(0.19, -0.48);
  arrowShape.lineTo(0.19, -0.07);
  arrowShape.lineTo(0.46, -0.07);
  arrowShape.closePath();
  part(root, extrudedShape('ramp-arrow', arrowShape, 0.01, 0), palette.yellow, [0, 0.93, 0], [1, 1, 1], [-Math.PI / 2 + angle, 0, 0]);
  return root;
}

export function createCoin() {
  const root = new THREE.Group();
  root.name = 'Alpine coin';
  part(root, cylinderGeometry(), palette.gold, [0, 0, 0], [0.36, 0.105, 0.36], [Math.PI / 2, 0, 0]);
  torus(root, palette.gold, 0.365, 0.069);
  const star = new THREE.Shape();
  for (let i = 0; i < 10; i += 1) {
    const angle = Math.PI / 2 + i * Math.PI / 5;
    const radius = i % 2 === 0 ? 0.225 : 0.106;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) star.moveTo(x, y); else star.lineTo(x, y);
  }
  star.closePath();
  const starGeometry = extrudedShape('coin-star', star, 0.025, 0.008);
  part(root, starGeometry, palette.yellow, [0, 0, -0.071]);
  part(root, starGeometry, palette.yellow, [0, 0, 0.071]);
  return root;
}

function createPenguin() {
  const root = new THREE.Group();
  root.name = 'Penguin friend';
  for (const sign of [-1, 1]) {
    sphere(root, palette.coral, [sign * 0.17, 0.07, -0.17], [0.14, 0.065, 0.23]);
  }
  sphere(root, palette.dark, [0, 0.61, 0], [0.45, 0.57, 0.36]);
  sphere(root, palette.snow, [0, 0.61, -0.263], [0.33, 0.43, 0.15]);
  sphere(root, palette.dark, [0, 1.105, -0.03], [0.325, 0.31, 0.285]);
  for (const sign of [-1, 1]) {
    sphere(root, palette.snow, [sign * 0.118, 1.12, -0.238], [0.155, 0.19, 0.092]);
    sphere(root, palette.dark, [sign * 0.117, 1.183, -0.327], [0.038, 0.047, 0.026]);
    sphere(root, palette.snow, [sign * 0.11 - 0.008, 1.197, -0.35], [0.009, 0.011, 0.007]);
    const wing = sphere(root, palette.navy, [sign * 0.447, 0.67, 0.005], [0.105, 0.335, 0.175]);
    wing.rotation.z = sign * 0.35;
  }
  part(root, coneGeometry(), palette.coral, [0, 1.07, -0.36], [0.095, 0.18, 0.07], [-Math.PI / 2, 0, 0]);
  part(root, cylinderGeometry(), palette.mint, [0, 0.93, -0.015], [0.307, 0.1, 0.265]);
  box(root, palette.mint, [0.19, 0.78, -0.288], [0.13, 0.32, 0.06], [0, 0, -0.16]);
  root.userData.isPenguin = true;
  return root;
}

export function createPowerup(type) {
  if (type === 'penguin') return createPenguin();
  const root = new THREE.Group();
  root.name = `${type} powerup`;
  const cyanGlow = material('shield-glow', 0x75e6ff, { emissive: 0x2199c1, emissiveIntensity: 0.7, metalness: 0.25, roughness: 0.23 });
  const redGlow = material('magnet-glow', 0xff866b, { emissive: 0xb52d35, emissiveIntensity: 0.45, metalness: 0.25, roughness: 0.28 });
  if (type === 'shield') {
    const shield = new THREE.Shape();
    shield.moveTo(0, 0.58);
    shield.lineTo(0.47, 0.35);
    shield.lineTo(0.39, -0.2);
    shield.quadraticCurveTo(0.28, -0.45, 0, -0.59);
    shield.quadraticCurveTo(-0.28, -0.45, -0.39, -0.2);
    shield.lineTo(-0.47, 0.35);
    shield.closePath();
    part(root, extrudedShape('shield-icon', shield, 0.13, 0.035), cyanGlow);
    part(root, extrudedShape('shield-icon', shield, 0.13, 0.035), palette.navy, [0, 0, -0.092], [0.76, 0.76, 0.25]);
    box(root, palette.snow, [0, 0, -0.13], [0.105, 0.43, 0.035]);
    box(root, palette.snow, [0, 0, -0.13], [0.35, 0.105, 0.035]);
    torus(root, cyanGlow, 0.76, 0.026, [0, 0, 0.06]);
  } else {
    const magnet = new THREE.Shape();
    magnet.moveTo(-0.5, 0.43);
    magnet.lineTo(-0.5, -0.03);
    magnet.quadraticCurveTo(-0.5, -0.56, 0, -0.56);
    magnet.quadraticCurveTo(0.5, -0.56, 0.5, -0.03);
    magnet.lineTo(0.5, 0.43);
    magnet.lineTo(0.23, 0.43);
    magnet.lineTo(0.23, -0.03);
    magnet.quadraticCurveTo(0.23, -0.26, 0, -0.26);
    magnet.quadraticCurveTo(-0.23, -0.26, -0.23, -0.03);
    magnet.lineTo(-0.23, 0.43);
    magnet.closePath();
    part(root, extrudedShape('magnet-icon', magnet, 0.16, 0.025), redGlow);
    for (const sign of [-1, 1]) box(root, palette.snow, [sign * 0.365, 0.38, 0], [0.284, 0.19, 0.21]);
    torus(root, redGlow, 0.76, 0.026, [0, 0, 0.06]);
  }
  root.userData.powerupType = type;
  return root;
}

export function createCabin() {
  const root = new THREE.Group();
  root.name = 'Summit chalet';
  box(root, palette.wood, [0, 1.5, 0], [6, 3, 4]);
  box(root, palette.snowShade, [0, 0.11, 0], [6.55, 0.22, 4.55]);
  for (let i = 0; i < 9; i += 1) {
    const y = 0.31 + i * 0.32;
    for (const sign of [-1, 1]) {
      part(root, cylinderGeometry(), i % 2 ? palette.wood : palette.woodLight, [0, y, sign * 2.015], [0.177, 6.22, 0.177], [0, 0, Math.PI / 2]);
      part(root, cylinderGeometry(), i % 2 ? palette.woodLight : palette.wood, [sign * 3.015, y, 0], [0.175, 4.22, 0.175], [Math.PI / 2, 0, 0]);
    }
  }
  const gable = new THREE.Shape();
  gable.moveTo(-3.25, 0);
  gable.lineTo(3.25, 0);
  gable.lineTo(0, 1.73);
  gable.closePath();
  for (const sign of [-1, 1]) part(root, extrudedShape('cabin-gable', gable, 0.15, 0), palette.wood, [0, 3, sign * 2.01]);
  const angle = Math.atan2(1.8, 3.6);
  for (const sign of [-1, 1]) {
    box(root, palette.navy, [sign * 1.8, 3.9, 0], [Math.hypot(3.6, 1.8), 0.21, 5.1], [0, 0, -sign * angle]);
    box(root, palette.snow, [sign * 1.8, 4.045, 0], [Math.hypot(3.6, 1.8) + 0.06, 0.21, 5.19], [0, 0, -sign * angle]);
    beam(root, palette.bark, [0, 4.84, sign * 2.61], [sign * 3.67, 3.015, sign * 2.61], 0.11);
    beam(root, palette.bark, [0, 4.84, sign * 2.61], [-sign * 3.67, 3.015, sign * 2.61], 0.11);
  }
  const warmGlass = material('window-glow', 0xffd98a, { emissive: 0xffad45, emissiveIntensity: 0.65, roughness: 0.3 });
  for (const x of [-1.96, 1.96]) {
    box(root, palette.bark, [x, 1.72, -2.23], [1.19, 1.19, 0.15]);
    box(root, warmGlass, [x, 1.72, -2.32], [0.96, 0.96, 0.055]);
    box(root, palette.bark, [x, 1.72, -2.36], [0.07, 1.01, 0.05]);
    box(root, palette.bark, [x, 1.72, -2.36], [1.01, 0.07, 0.05]);
    box(root, palette.snow, [x, 1.085, -2.31], [1.34, 0.12, 0.38]);
  }
  box(root, palette.bark, [0, 1.15, -2.21], [1.36, 2.3, 0.19]);
  box(root, palette.navy, [0, 1.115, -2.325], [1.12, 2.1, 0.06]);
  box(root, warmGlass, [0, 1.69, -2.37], [0.64, 0.59, 0.035]);
  sphere(root, palette.gold, [0.36, 0.98, -2.4], [0.052, 0.052, 0.052]);
  box(root, palette.snowShade, [0, 0.09, -2.73], [1.72, 0.18, 0.76]);
  box(root, palette.bark, [1.79, 4.77, 0.72], [0.68, 1.85, 0.72]);
  for (let i = 0; i < 5; i += 1) box(root, palette.wood, [1.79, 4.08 + i * 0.29, 0.72], [0.715, 0.08, 0.755]);
  box(root, palette.snow, [1.79, 5.74, 0.72], [0.89, 0.17, 0.91]);
  box(root, palette.dark, [1.79, 5.838, 0.72], [0.48, 0.015, 0.5]);
  return root;
}

export function createMountain(seed = 0) {
  const key = Number(seed) || 0;
  if (!mountainCache.has(key)) {
    const random = rng(key);
    const sectors = 10;
    const rings = [];
    const height = 47 + random() * 8;
    const driftX = (random() - 0.5) * 12;
    const driftZ = (random() - 0.5) * 8;
    const levels = [[0, 43], [0.28, 29], [0.56, 18], [0.8, 9]];
    levels.forEach(([fraction, radius], level) => {
      const ring = [];
      for (let i = 0; i < sectors; i += 1) {
        const angle = i / sectors * Math.PI * 2;
        const r = radius * (0.82 + random() * 0.28);
        ring.push(new THREE.Vector3(
          Math.cos(angle) * r + driftX * fraction,
          level === 0 ? 0 : height * fraction + (random() - 0.5) * 5,
          Math.sin(angle) * r * 0.74 + driftZ * fraction,
        ));
      }
      rings.push(ring);
    });
    const positions = [];
    const colors = [];
    const blues = [0x7293ac, 0x89a5b9, 0x9eb8c7, 0x6d8ca6];
    const whites = [0xe4f1f7, 0xf1f9fc, 0xd2e5ef, 0xbfd9e8];
    function face(a, b, c, snowy) {
      const swatch = snowy ? whites : blues;
      const tint = new THREE.Color(swatch[Math.floor(random() * swatch.length)]);
      for (const point of [a, b, c]) {
        positions.push(point.x, point.y, point.z);
        colors.push(tint.r, tint.g, tint.b);
      }
    }
    for (let level = 0; level < rings.length - 1; level += 1) {
      for (let i = 0; i < sectors; i += 1) {
        const next = (i + 1) % sectors;
        face(rings[level][i], rings[level + 1][i], rings[level][next], level > 1 || (level === 1 && random() > 0.67));
        face(rings[level][next], rings[level + 1][i], rings[level + 1][next], level > 0);
      }
    }
    const peak = new THREE.Vector3(driftX, height, driftZ);
    for (let i = 0; i < sectors; i += 1) face(rings[3][i], peak, rings[3][(i + 1) % sectors], true);
    const result = new THREE.BufferGeometry();
    result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    result.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    result.computeVertexNormals();
    result.userData.sharedModelResource = true;
    mountainCache.set(key, result);
  }
  const root = new THREE.Group();
  root.name = 'Alpine peak';
  const surface = material('mountain', 0xffffff, { vertexColors: true, roughness: 1 });
  part(root, mountainCache.get(key), surface);
  return root;
}

function gateLabel(label) {
  if (labelCache.has(label)) return labelCache.get(label);
  if (typeof document === 'undefined') return palette.navy;
  const canvas = document.createElement('canvas');
  canvas.width = 1536;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) return palette.navy;
  context.fillStyle = '#244758';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#70d6ca';
  context.lineWidth = 8;
  context.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);
  context.fillStyle = '#fff9e7';
  context.font = '900 126px "Arial", "Microsoft YaHei", sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, canvas.width / 2, canvas.height / 2 + 7, canvas.width - 130);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.userData.sharedModelResource = true;
  const surface = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8, side: THREE.DoubleSide });
  surface.userData.sharedModelResource = true;
  labelCache.set(label, surface);
  return surface;
}

export function createGate(label = 'SUMMIT RUN') {
  const root = new THREE.Group();
  root.name = 'Race gate';
  for (const sign of [-1, 1]) {
    part(root, cylinderGeometry(), palette.coral, [sign * 9.75, 3.35, 0], [0.24, 6.7, 0.24]);
    for (let i = 0; i < 6; i += 1) part(root, cylinderGeometry(), palette.snow, [sign * 9.75, 0.75 + i * 0.86, 0], [0.245, 0.32, 0.245]);
    part(root, dodecaGeometry(), palette.snow, [sign * 9.75, 0.11, 0], [0.73, 0.21, 0.6]);
    sphere(root, palette.yellow, [sign * 9.75, 6.84, 0], [0.3, 0.3, 0.3]);
    box(root, palette.mint, [sign * 7.78, 6.04, 0], [3.44, 1.18, 0.12]);
    for (let i = 0; i < 4; i += 1) {
      for (let j = 0; j < 2; j += 1) {
        if ((i + j) % 2 === 0) {
          for (const side of [-1, 1]) box(root, palette.snow, [sign * (6.5 + i * 0.64), 5.74 + j * 0.58, side * 0.073], [0.64, 0.58, 0.016]);
        }
      }
    }
  }
  box(root, palette.snow, [0, 6.73, 0], [20.05, 0.23, 0.34]);
  box(root, palette.navy, [0, 6.05, 0], [11.55, 1.52, 0.18]);
  part(root, geometry('gate-label-plane', () => new THREE.PlaneGeometry(11.5, 1.48)), gateLabel(String(label)), [0, 6.05, -0.104], [1, 1, 1], [0, Math.PI, 0]);
  part(root, geometry('gate-label-plane', () => new THREE.PlaneGeometry(11.5, 1.48)), gateLabel(String(label)), [0, 6.05, 0.104]);
  root.userData.label = String(label);
  return root;
}

export function disposeObject(object) {
  if (!object) return;
  const disposed = new Set();
  const release = (resource) => {
    if (!resource || resource.userData?.sharedModelResource || disposed.has(resource)) return;
    disposed.add(resource);
    resource.dispose?.();
  };
  object.traverse((child) => {
    release(child.geometry);
    const surfaces = child.material ? (Array.isArray(child.material) ? child.material : [child.material]) : [];
    surfaces.forEach((surface) => {
      if (!surface.userData?.sharedModelResource) {
        for (const value of Object.values(surface)) if (value?.isTexture) release(value);
        release(surface);
      }
    });
  });
  object.removeFromParent();
}
