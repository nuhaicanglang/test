import * as THREE from 'three';
import { terrainHeight, terrainSlope } from './terrain.js';
import { getSkierPose } from './pose.js';
import { createSkier, createTree, createRock, createLog, createRamp, createCoin, createPowerup, createCabin, createMountain, createGate } from './models.js';

const hash = (n) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
const dummy = new THREE.Object3D();
const tempColor = new THREE.Color();
const skinColors = { orange: 0xf26943, blue: 0x228bba, violet: 0x9674c5 };

export class SkiWorld {
  constructor(canvas, quality = 'high') {
    this.canvas = canvas;
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#c6e2e4');
    this.scene.fog = new THREE.Fog('#d6e8e8', 100, 345);
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 650);
    this.camera.position.set(21, 13, 25);
    this.lookAt = new THREE.Vector3(-7, 0, -13);
    this.scene.add(new THREE.HemisphereLight(0xe8faff, 0x739497, 2.4));
    this.sunlight = new THREE.DirectionalLight(0xffe1b8, 3.3);
    this.sunlight.position.set(-38, 55, -35);
    this.sunlight.castShadow = true;
    this.sunlight.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sunlight.shadow.camera, { left: -35, right: 35, top: 40, bottom: -35, near: 1, far: 150 });
    this.sunlight.shadow.bias = -0.0006;
    this.sunlight.shadow.normalBias = 0.055;
    this.scene.add(this.sunlight);
    this.entityMeshes = new Map();
    this.entityPools = new Map();
    this.time = 0;
    this.shake = 0;
    this.menuDistance = 0;
    this.lastTerrain = -100;
    this.lastTrail = 0;
    this.buildTerrain();
    this.buildScenery();
    this.buildCrestMarker();
    this.buildSnow();
    this.buildTrails();
    this.player = new THREE.Group();
    this.skier = createSkier(skinColors.orange);
    this.player.add(this.skier);
    this.scene.add(this.player);
    this.penguin = createPowerup('penguin');
    this.penguin.scale.setScalar(1.25);
    this.player.add(this.penguin);
    this.penguin.visible = false;
    this.shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(1.65, 20, 14), new THREE.MeshBasicMaterial({ color: 0x81eced, transparent: true, opacity: 0.16, depthWrite: false, wireframe: true }));
    this.shieldMesh.position.y = 1.1;
    this.player.add(this.shieldMesh);
    this.buildAvalanche();
    this.setQuality(quality);
    this.resize();
  }

  groundHeight(x, d) {
    const bank = Math.max(0, Math.abs(x) - 11);
    return terrainHeight(d) + bank * 0.14 + Math.sin(x * 0.18 + d * 0.024) * Math.min(bank * 0.085, 2.8);
  }

  buildTerrain() {
    const geometry = new THREE.PlaneGeometry(190, 440, 64, 240);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, 0, -175);
    this.terrainBase = geometry.attributes.position.array.slice();
    const colors = new Float32Array(geometry.attributes.position.count * 3);
    for (let i = 0; i < colors.length / 3; i++) {
      const x = this.terrainBase[i * 3];
      tempColor.set(Math.abs(x) < 10 ? '#f0f6f1' : '#e4efec');
      tempColor.multiplyScalar(0.97 + hash(i) * 0.05);
      tempColor.toArray(colors, i * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.terrain = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: false }));
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);
    // 雪道边缘的细线帮助辨认可滑行区域，随地形一起更新。
    this.boundary = [-1, 1].map((side) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(240 * 3), 3));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x73a9af, transparent: true, opacity: 0.35 }));
      this.scene.add(line);
      return { side, line };
    });
  }

  updateTerrain(distance) {
    const position = this.terrain.geometry.attributes.position;
    const base = terrainHeight(distance);
    for (let i = 0; i < position.count; i++) {
      const x = this.terrainBase[i * 3], z = this.terrainBase[i * 3 + 2];
      position.setY(i, this.groundHeight(x, distance - z) - base);
    }
    position.needsUpdate = true;
    this.terrain.geometry.computeVertexNormals();
    this.boundary.forEach(({ side, line }) => {
      const attr = line.geometry.attributes.position;
      for (let i = 0; i < attr.count; i++) {
        const z = 40 - i * 1.8;
        attr.setXYZ(i, side * 10, this.groundHeight(side * 10, distance - z) - base + 0.03, z);
      }
      attr.needsUpdate = true;
    });
  }

  buildScenery() {
    this.mountains = new THREE.Group();
    const peaks = [ [-105, -16, -200, 1.8], [-48, -24, -277, 2.8], [65, -18, -220, 2.3], [131, -16, -230, 2.2], [14, -28, -340, 3.1] ];
    peaks.forEach(([x, y, z, scale], i) => {
      const mountain = createMountain(i + 6);
      mountain.position.set(x, y, z);
      mountain.scale.set(scale, scale * (0.8 + i * 0.04), scale);
      mountain.rotation.y = i * 1.3;
      this.mountains.add(mountain);
    });
    this.scene.add(this.mountains);
    this.sun = new THREE.Mesh(new THREE.CircleGeometry(14, 48), new THREE.MeshBasicMaterial({ color: 0xffecc9, fog: false, depthWrite: false }));
    this.sun.position.set(-97, 91, -360);
    this.scene.add(this.sun);
    const treeTemplate = createTree(3);
    treeTemplate.updateMatrixWorld(true);
    this.treeParts = [];
    treeTemplate.traverse((child) => {
      if (!child.isMesh) return;
      const geo = child.geometry.clone().applyMatrix4(child.matrixWorld);
      const mesh = new THREE.InstancedMesh(geo, child.material, 180);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.treeParts.push(mesh);
      this.scene.add(mesh);
    });
    this.trees = Array.from({ length: 180 }, (_, i) => ({
      x: (i % 2 ? 1 : -1) * (12 + hash(i + 6) * 70),
      d: hash(i + 41) * 340,
      scale: 0.65 + hash(i + 18) * 1.1,
      rotation: hash(i + 75) * Math.PI * 2,
    }));
    this.cabins = [createCabin(), createCabin()];
    this.cabins.forEach((cabin, i) => { cabin.rotation.y = i ? -0.6 : 0.5; this.scene.add(cabin); });
    this.gate = createGate('POWDER  /  BASE CAMP');
    this.scene.add(this.gate);
    this.flags = [];
    const poleGeo = new THREE.CylinderGeometry(0.055, 0.055, 2.1, 5);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x3b666b });
    for (let i = 0; i < 22; i++) {
      const flag = new THREE.Group();
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.y = 1.05;
      flag.add(pole);
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xf27550 : 0x4d949d, side: THREE.DoubleSide }));
      cloth.position.set(0.45, 1.8, 0);
      flag.add(cloth);
      this.scene.add(flag);
      this.flags.push(flag);
    }
  }

  buildCrestMarker() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 18 * 3), 3));
    this.crestMarker = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0x42959e, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false }));
    this.crestMarker.frustumCulled = false;
    this.scene.add(this.crestMarker);
  }

  updateCrestMarker(distance) {
    const crest = Math.floor((distance + 170) / 360) * 360 + 160;
    const attr = this.crestMarker.geometry.attributes.position;
    const base = terrainHeight(distance);
    let vertex = 0;
    for (let arrow = 0; arrow < 3; arrow++) {
      const d = crest - 12 + arrow * 3.2;
      // 三道贴合真实坡面的箭头标出起飞唇，跳过后自动切换到下一飞坡。
      for (const side of [-1, 1]) {
        const points = [[side * 4.8, d - 1.8], [0, d + 0.7], [0, d - 0.15], [side * 4.8, d - 1.8], [0, d - 0.15], [side * 4.8, d - 2.65]];
        for (const [x, sampleD] of points) attr.setXYZ(vertex++, x, terrainHeight(sampleD) - base + 0.07, distance - sampleD);
      }
    }
    this.crestMarker.geometry.setDrawRange(0, vertex);
    attr.needsUpdate = true;
  }

  updateScenery(distance) {
    const base = terrainHeight(distance);
    this.trees.forEach((tree, i) => {
      const relative = ((tree.d - distance) % 340 + 340) % 340 - 28;
      dummy.position.set(tree.x, this.groundHeight(tree.x, distance + relative) - base, -relative);
      dummy.rotation.set(0, tree.rotation, 0);
      dummy.scale.setScalar(tree.scale);
      dummy.updateMatrix();
      this.treeParts.forEach((part) => part.setMatrixAt(i, dummy.matrix));
    });
    this.treeParts.forEach((part) => { part.instanceMatrix.needsUpdate = true; });
    this.cabins.forEach((cabin, i) => {
      const relative = ((96 + i * 235 - distance) % 560 + 560) % 560 - 40;
      const x = i ? -23 : 23;
      cabin.position.set(x, this.groundHeight(x, distance + relative) - base, -relative);
    });
    this.gate.position.set(0, terrainHeight(24) - base, distance - 24);
    this.gate.visible = distance < 60;
    this.flags.forEach((flag, i) => {
      const relative = ((i * 18 - distance) % 198 + 198) % 198 - 12;
      const x = i % 2 ? -10.5 : 10.5;
      flag.position.set(x, this.groundHeight(x, distance + relative) - base, -relative);
    });
  }

  buildSnow() {
    const positions = new Float32Array(380 * 3);
    for (let i = 0; i < 380; i++) {
      positions[i * 3] = (hash(i + 210) - 0.5) * 85;
      positions[i * 3 + 1] = hash(i + 760) * 35;
      positions[i * 3 + 2] = (hash(i + 521) - 0.7) * 95;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.snow = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.1, transparent: true, opacity: 0.8, depthWrite: false }));
    this.scene.add(this.snow);
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(120 * 3), 3));
    this.dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.15, transparent: true, opacity: 0.8, depthWrite: false }));
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);
  }

  buildTrails() {
    this.trailPoints = [];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(240 * 12), 3));
    this.trails = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x86aeb5, transparent: true, opacity: 0.32 }));
    this.trails.frustumCulled = false;
    this.scene.add(this.trails);
  }

  buildAvalanche() {
    this.avalanche = new THREE.Group();
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0xe4f0f4, flatShading: true, transparent: true, opacity: 0.86, roughness: 1 });
    for (let i = 0; i < 28; i++) {
      const cloud = new THREE.Mesh(geo, material);
      cloud.position.set((i - 14) * 2.5, hash(i) * 2, hash(i + 14) * 5);
      cloud.scale.setScalar(3 + hash(i + 50) * 3);
      this.avalanche.add(cloud);
    }
    this.scene.add(this.avalanche);
  }

  entityModel(type) {
    const factories = { coin: createCoin, tree: createTree, rock: createRock, log: createLog, ramp: createRamp };
    return factories[type] ? factories[type]() : createPowerup(type);
  }

  updateEntities(state) {
    const ids = new Set();
    const base = terrainHeight(state.distance);
    for (const entity of state.entities) {
      if (entity.collected || entity.d < state.distance - 20 || entity.d > state.distance + 250) continue;
      ids.add(entity.id);
      let mesh = this.entityMeshes.get(entity.id);
      // 重开会复用实体编号，但新的赛道可能在同一编号放置不同物件。
      if (mesh && mesh.userData.entityType !== entity.type) {
        this.scene.remove(mesh);
        const oldType = mesh.userData.entityType;
        if (!this.entityPools.has(oldType)) this.entityPools.set(oldType, []);
        this.entityPools.get(oldType).push(mesh);
        this.entityMeshes.delete(entity.id);
        mesh = null;
      }
      if (!mesh) {
        const pool = this.entityPools.get(entity.type);
        mesh = pool?.pop() || this.entityModel(entity.type);
        mesh.userData.entityType = entity.type;
        this.entityMeshes.set(entity.id, mesh);
        this.scene.add(mesh);
      }
      const lift = entity.type === 'coin' ? 1.5 + Math.sin(this.time * 2.8 + entity.d) * 0.15 : ['shield', 'magnet'].includes(entity.type) ? 1.65 + Math.sin(this.time * 2) * 0.3 : 0;
      mesh.position.set(entity.x, terrainHeight(entity.d) - base + lift, state.distance - entity.d);
      if (entity.type === 'ramp' || entity.type === 'log') mesh.rotation.x = Math.atan(terrainSlope(entity.d));
      if (entity.type === 'coin') mesh.rotation.y = this.time * 2.4;
      if (['shield', 'magnet'].includes(entity.type)) mesh.rotation.y = this.time;
    }
    for (const [id, mesh] of this.entityMeshes) {
      if (ids.has(id)) continue;
      this.scene.remove(mesh);
      this.entityMeshes.delete(id);
      const type = mesh.userData.entityType;
      if (!this.entityPools.has(type)) this.entityPools.set(type, []);
      this.entityPools.get(type).push(mesh);
    }
  }

  setSkin(id) {
    if (!skinColors[id] || id === this.skin) return;
    this.skin = id;
    this.player.remove(this.skier);
    this.skier = createSkier(skinColors[id]);
    this.player.add(this.skier);
  }

  setQuality(quality) {
    this.quality = quality;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'low' ? 1 : 1.75));
    this.renderer.shadowMap.enabled = quality !== 'low';
    if (this.snow) this.snow.geometry.setDrawRange(0, quality === 'low' ? 100 : 380);
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.renderer.setSize(this.width, this.height);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  }

  onEvent(event) {
    if (event.type === 'crash') this.shake = 0.35 + (event.tier || 1) * 0.18;
    if (event.type === 'flip') this.shake = Math.min(0.25, (event.turns || 1) * 0.045);
    if (event.type === 'start') { this.trailPoints.length = 0; this.lastTrail = 0; this.lastTerrain = -100; }
  }

  render(state, dt, input = {}) {
    this.time += dt;
    const menu = state.phase === 'menu';
    const compact = this.width < 700;
    const distance = menu ? 0 : state.distance;
    if (Math.abs(distance - this.lastTerrain) > 0.6) {
      this.updateTerrain(distance);
      this.updateScenery(distance);
      this.updateCrestMarker(distance);
      this.lastTerrain = distance;
    }
    this.updateEntities(menu ? { ...state, distance: 0 } : state);
    const x = menu ? 2.5 : state.x;
    const y = menu ? 0 : state.y;
    this.player.position.set(x, y, menu && compact ? 4 : 0);
    this.player.scale.setScalar(THREE.MathUtils.damp(this.player.scale.x, menu ? 1.85 : 1, 5, dt));
    const steer = menu ? -0.12 : state.recovering > 0 ? 0 : input.steer || 0;
    this.player.rotation.y = THREE.MathUtils.damp(this.player.rotation.y, menu ? -0.5 : -steer * 0.18, 8, dt);
    const pose = getSkierPose(state, { menu, steer, time: this.time });
    this.skier.rotation.set(pose.pitch, 0, pose.roll, 'XYZ');
    this.skier.position.set(pose.offsetX, pose.offsetY, pose.offsetZ);
    this.penguin.visible = state.penguin > 0 && !menu && !(state.recovering > 0);
    this.shieldMesh.visible = (state.shield > 0 || state.invincible > 0) && !menu && !(state.recovering > 0);
    this.shieldMesh.rotation.y += dt * 0.5;
    this.skier.visible = state.recovering > 0 || !(state.invincible > 0 && Math.sin(this.time * 24) < -0.4);
    if (this.skier.userData.scarf) this.skier.userData.scarf.rotation.y = Math.sin(this.time * 8) * 0.18;
    if (this.skier.userData.leftArm) this.skier.userData.leftArm.rotation.x = (y > 0.5 ? -0.5 : 0) + Math.sin(this.time * 3) * 0.07;
    if (this.skier.userData.rightArm) this.skier.userData.rightArm.rotation.x = (y > 0.5 ? -0.5 : 0) - Math.sin(this.time * 3) * 0.07;
    this.gate.visible = distance < 60 && !(menu && compact);
    const cameraX = x * (compact ? 0.85 : 0.33) + (compact ? 0.6 : 1.8);
    const cameraZ = 17.5 + (state.boosting ? 2 : 0);
    const terrainBase = terrainHeight(distance);
    const behindHeight = this.groundHeight(cameraX, distance - cameraZ) - terrainBase;
    const aheadHeight = terrainHeight(distance + 22) - terrainBase;
    const slopeLook = THREE.MathUtils.clamp(aheadHeight * 0.32, -5.5, 3);
    // 高空时跟随角色的完整高度，陡降时把镜头抬出背后的山体。
    const cameraTarget = menu ? new THREE.Vector3(compact ? 19 : 23, 14, compact ? 31 : 25) : new THREE.Vector3(cameraX, Math.max(9.5 + y, behindHeight + 5), cameraZ);
    const lookTarget = menu ? new THREE.Vector3(compact ? -3 : -9, 1, -12) : new THREE.Vector3(x * (compact ? 0.93 : 0.6), y - 0.4 + slopeLook, -22);
    const damping = 1 - Math.exp(-dt * (menu ? 2 : 7));
    this.camera.position.lerp(cameraTarget, damping);
    this.lookAt.lerp(lookTarget, damping);
    if (!menu) this.camera.position.y = Math.max(this.camera.position.y, this.groundHeight(this.camera.position.x, distance - this.camera.position.z) - terrainBase + 2.8);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.6;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.3;
    }
    this.camera.lookAt(this.lookAt);
    const airFov = Math.min(5, y * 0.12);
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, menu ? 46 : (compact ? 58 : state.boosting ? 56 : 50) + airFov, 3, dt);
    this.camera.updateProjectionMatrix();
    this.sun.lookAt(this.camera.position);
    const dusk = THREE.MathUtils.smoothstep(distance % 4500, 1500, 2500) * (1 - THREE.MathUtils.smoothstep(distance % 4500, 3500, 4500));
    this.scene.background.set('#c6e2e4').lerp(tempColor.set('#c8bfd5'), dusk);
    this.scene.fog.color.set('#d6e8e8').lerp(tempColor.set('#decbd7'), dusk);
    this.sunlight.color.set('#ffe1b8').lerp(tempColor.set('#ffc09c'), dusk);
    this.avalanche.visible = !menu;
    this.avalanche.position.set(0, 0, 9 + Math.max(0, state.avalanche) * 0.3);
    this.avalanche.children.forEach((cloud, i) => {
      cloud.rotation.x += dt * (0.3 + hash(i) * 0.4);
      const snowD = distance - this.avalanche.position.z - cloud.position.z;
      cloud.position.y = this.groundHeight(cloud.position.x, snowD) - terrainBase + 1.4 + Math.sin(this.time * 2 + i) * 0.6 + hash(i) * 2;
    });
    const snow = this.snow.geometry.attributes.position;
    for (let i = 0; i < snow.count; i++) {
      let z = snow.getZ(i) + dt * (menu ? 1 : state.phase === 'playing' ? state.speed * 0.65 : 0.4);
      let sy = snow.getY(i) - dt * 0.8;
      if (z > 25) z -= 95;
      if (sy < -6) sy += 35;
      snow.setXYZ(i, snow.getX(i) + Math.sin(this.time + i) * dt * 0.1, sy, z);
    }
    snow.needsUpdate = true;
    this.snow.position.y = y * 0.85;
    const dust = this.dust.geometry.attributes.position;
    this.dust.visible = !menu && y < 0.3 && state.phase === 'playing';
    for (let i = 0; i < dust.count; i++) {
      const age = (this.time * 1.4 + hash(i)) % 1;
      dust.setXYZ(i, x + (hash(i + 2) - 0.5) * age * (state.recovering > 0 ? 5 : 3) - steer * age * 2, terrainHeight(distance - age * 6) - terrainBase + age * (1.3 + hash(i) * 1.4), age * 6 + 0.2);
    }
    dust.needsUpdate = true;
    if (state.phase === 'playing' && distance - this.lastTrail > 0.4) {
      this.trailPoints.push({ x, d: distance, onGround: y < 0.25 });
      if (this.trailPoints.length > 241) this.trailPoints.shift();
      this.lastTrail = distance;
    }
    const attr = this.trails.geometry.attributes.position;
    let vertex = 0;
    const base = terrainHeight(distance);
    for (let i = 1; i < this.trailPoints.length; i++) {
      const a = this.trailPoints[i - 1], b = this.trailPoints[i];
      if (!a.onGround || !b.onGround) continue;
      for (const side of [-0.26, 0.26]) {
        attr.setXYZ(vertex++, a.x + side, terrainHeight(a.d) - base + 0.025, distance - a.d);
        attr.setXYZ(vertex++, b.x + side, terrainHeight(b.d) - base + 0.025, distance - b.d);
      }
    }
    this.trails.geometry.setDrawRange(0, vertex);
    attr.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
  }
}
