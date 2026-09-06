import * as THREE from "three";
import { mountainHeight, sampleTerrain } from "./mountain-field.js";
import { InfiniteTerrain } from "./infinite-terrain.js";
import { getSkierPose } from "./pose.js";
import {
  createSkier,
  createTree,
  createRock,
  createLog,
  createRamp,
  createCoin,
  createPowerup,
  createCabin,
  createMountain,
  createGate,
} from "./models.js";
import { MaterialLibrary, makeSurface } from "./materials.js";
import { AlpineEnvironment } from "./environment.js";
import { AlpinePost } from "./postprocessing.js";

import { QUALITY, normalizeQuality } from "./quality.js";

const hash = (n) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};
const dummy = new THREE.Object3D();
const skins = { orange: 0xe85f35, blue: 0x347e9e, violet: 0x86748e };
function pointMaterial(size, opacity, color) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      pointSize: { value: size },
      opacity: { value: opacity },
      tint: { value: new THREE.Color(color) },
      pixelRatio: { value: 1 },
    },
    vertexShader: `uniform float pointSize;uniform float pixelRatio;varying float vDepth;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vDepth=-mv.z;gl_PointSize=clamp(pointSize*pixelRatio*220./max(1.,-mv.z),1.,400.);gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `uniform float opacity;uniform vec3 tint;varying float vDepth;
    void main(){float r=length(gl_PointCoord-.5)*2.;float a=pow(max(0.,1.-r*r),2.)*opacity;if(a<.01)discard;
    vec3 c=mix(tint,vec3(.70,.80,.88),clamp(vDepth/300.,0.,.7));gl_FragColor=vec4(c,a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`,
  });
}

export class SkiWorld {
  constructor(canvas, quality = "ultra", report = () => {}) {
    this.canvas = canvas;
    this.quality = normalizeQuality(quality);
    this.motion = true;
    this.reducedMotion =
      globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
      false;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 5000);
    this.camera.position.set(19, 11, 25);
    this.lookAt = new THREE.Vector3(-8, 4, -55);
    this.time = 0;
    this.shake = 0;
    this.lastTrail = 0;
    this.landingDust = 0;
    this.wasGrounded = true;
    this.entityMeshes = new Map();
    this.entityPools = new Map();
    this.origin = new THREE.Vector3();
    this.orbit = 0;
    this.terrainChunks = new InfiniteTerrain(
      this.scene,
      makeSurface("snow-track", 0xffffff, {
        roughness: 0.91,
        vertexColors: true,
      }),
    );
    this.buildScenery();

    this.buildParticles();
    this.buildTrails();
    this.player = new THREE.Group();
    this.skierVariants = Object.fromEntries(
      Object.entries(skins).map(([id, color]) => [id, createSkier(color)]),
    );
    this.skier = this.skierVariants.orange;
    this.player.add(this.skier);
    this.scene.add(this.player);
    this.penguin = createPowerup("penguin");
    this.penguin.scale.setScalar(0.92);
    this.player.add(this.penguin);
    this.penguin.visible = false;
    this.shieldMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.2, 24, 18),
      new THREE.MeshPhysicalMaterial({
        color: 0x89d8ed,
        roughness: 0.2,
        metalness: 0.1,
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
        clearcoat: 1,
      }),
    );
    this.shieldMesh.scale.y = 1.15;
    this.shieldMesh.position.y = 1;
    this.player.add(this.shieldMesh);
    for (const type of [
      "coin",
      "tree",
      "rock",
      "log",
      "ramp",
      "shield",
      "magnet",
      "cabin",
    ])
      this.entityPools.set(type, [this.entityModel(type)]);
    this.environment = new AlpineEnvironment(
      this.scene,
      this.camera,
      this.renderer,
    );
    this.post = new AlpinePost(this.renderer, this.scene, this.camera);
    this.materials = new MaterialLibrary(this.renderer, (state) => {
      this.loadingState = state;
      report(state);
    });
    this.loadingState = { ready: false, progress: 0 };
    this.resize();
    this.readyPromise = this.setQuality(this.quality);
  }
  groundHeight(x, z) {
    return mountainHeight(x, z, this.seed);
  }
  buildScenery() {
    this.instances = {};
    for (const [name, template] of [
      ["tree", createTree(3, 0)],
      ["treeFar", createTree(3, 1)],
      ["rock", createRock(4)],
    ]) {
      template.updateMatrixWorld(true);
      const parts = [];
      template.traverse((child) => {
        if (!child.isMesh) return;
        const geometry = child.geometry.clone().applyMatrix4(child.matrixWorld);
        const mesh = new THREE.InstancedMesh(geometry, child.material, 1000);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.castShadow = name !== "treeFar";
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        mesh.count = 0;
        this.scene.add(mesh);
        parts.push(mesh);
      });
      this.instances[name] = parts;
    }
  }
  setOrbit(delta) {
    this.orbit = THREE.MathUtils.clamp(this.orbit + delta, -Math.PI, Math.PI);
  }

  buildParticles() {
    const positions = new Float32Array(1100 * 3);
    for (let i = 0; i < 1100; i++) {
      positions[i * 3] = (hash(i + 210) - 0.5) * 100;
      positions[i * 3 + 1] = hash(i + 760) * 42;
      positions[i * 3 + 2] = (hash(i + 521) - 0.7) * 110;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.snow = new THREE.Points(g, pointMaterial(0.095, 0.65, "#e4f0ff"));
    this.scene.add(this.snow);
    const dust = new THREE.BufferGeometry();
    dust.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(260 * 3), 3),
    );
    this.dust = new THREE.Points(dust, pointMaterial(0.6, 0.34, "#f4f6fb"));
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);
    const avalanche = new THREE.BufferGeometry();
    avalanche.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(200 * 3), 3),
    );
    this.avalanche = new THREE.Points(
      avalanche,
      pointMaterial(24, 0.48, "#9cb9ce"),
    );
    this.avalanche.frustumCulled = false;
    this.scene.add(this.avalanche);
    const contactMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { opacity: { value: 0.24 } },
      vertexShader:
        "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader:
        "varying vec2 vUv;uniform float opacity;void main(){float a=exp(-dot((vUv-.5)*vec2(4.,3.),(vUv-.5)*vec2(4.,3.)));gl_FragColor=vec4(.11,.19,.24,a*opacity);}",
    });
    this.contact = new THREE.Mesh(
      new THREE.PlaneGeometry(1.7, 3.1),
      contactMat,
    );
    this.contact.rotation.x = -Math.PI / 2;
    this.scene.add(this.contact);
  }
  buildTrails() {
    this.trailPoints = [];
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(240 * 12 * 3), 3),
    );
    this.trails = new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({
        color: 0x7894a7,
        transparent: true,
        opacity: 0.19,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.trails.frustumCulled = false;
    this.scene.add(this.trails);
  }
  entityModel(type) {
    const factories = {
      coin: createCoin,
      cabin: createCabin,
      tree: createTree,
      rock: createRock,
      log: createLog,
      ramp: createRamp,
    };
    return factories[type] ? factories[type]() : createPowerup(type);
  }
  updateEntities(state) {
    const ids = new Set(),
      counts = { tree: 0, treeFar: 0, rock: 0 },
      origin = this.origin || { x: 0, y: 0, z: 0 };
    const player = state.position || { x: 0, y: 0, z: -state.distance };
    for (const entity of state.entities) {
      const ez = entity.z ?? -entity.d,
        ey = entity.y ?? 0;
      if (
        entity.collected ||
        Math.hypot(entity.x - player.x, ez - player.z) > 235
      )
        continue;
      const instanced =
        this.instances && ["tree", "rock"].includes(entity.type);
      if (instanced) {
        const name =
          entity.type === "tree" &&
          Math.hypot(entity.x - player.x, ez - player.z) > 95
            ? "treeFar"
            : entity.type;
        const count = counts[name]++;
        if (count >= 1000) continue;
        dummy.position.set(entity.x - origin.x, ey - origin.y, ez - origin.z);
        dummy.rotation.set(0, entity.rotation || 0, 0);
        dummy.scale.setScalar(entity.scale || 1);
        dummy.updateMatrix();
        this.instances[name].forEach((mesh) =>
          mesh.setMatrixAt(count, dummy.matrix),
        );
        continue;
      }
      ids.add(entity.id);
      let mesh = this.entityMeshes.get(entity.id);
      if (mesh && mesh.userData.entityType !== entity.type) {
        this.scene.remove(mesh);
        const type = mesh.userData.entityType;
        if (!this.entityPools.has(type)) this.entityPools.set(type, []);
        this.entityPools.get(type).push(mesh);
        this.entityMeshes.delete(entity.id);
        mesh = null;
      }
      if (!mesh) {
        mesh =
          this.entityPools.get(entity.type)?.pop() ||
          this.entityModel(entity.type);
        mesh.userData.entityType = entity.type;
        this.entityMeshes.set(entity.id, mesh);
        this.scene.add(mesh);
      }
      const floating = ["coin", "shield", "magnet"].includes(entity.type);
      mesh.position.set(
        entity.x - origin.x,
        ey -
          origin.y +
          (floating ? 1.5 + Math.sin(this.time * 2 + entity.x) * 0.12 : 0),
        ez - origin.z,
      );
      mesh.rotation.set(
        0,
        floating ? this.time * 1.5 : entity.rotation || 0,
        0,
      );
    }
    for (const [name, parts] of Object.entries(this.instances || {}))
      parts.forEach((p) => {
        p.count = Math.min(1000, counts[name]);
        p.instanceMatrix.needsUpdate = true;
      });
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
    if (!skins[id] || id === this.skin) return;
    this.skin = id;
    this.player.remove(this.skier);
    this.skier = this.skierVariants[id];
    this.player.add(this.skier);
  }
  async setQuality(value) {
    const quality = normalizeQuality(value);
    this.requestedQuality = quality;
    const loaded = await this.materials.load(quality);
    if (!loaded || this.disposed || this.requestedQuality !== quality)
      return false;
    this.quality = quality;
    const preset = QUALITY[quality];
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, preset.dpr),
    );
    this.renderer.shadowMap.enabled = quality !== "low";
    this.environment.setQuality(quality);
    this.post.setQuality(quality);
    this.snow.geometry.setDrawRange(0, preset.snow);
    this.resize();
    return true;
  }
  setMotion(enabled) {
    this.motion = Boolean(enabled);
  }
  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.renderer.setSize(this.width, this.height);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.post?.resize(this.width, this.height);
    for (const p of [this.snow, this.dust, this.avalanche])
      if (p)
        p.material.uniforms.pixelRatio.value = this.renderer.getPixelRatio();
  }
  onEvent(event) {
    if (event.type === "crash") this.shake = 0.3 + (event.tier || 1) * 0.1;
    if (event.type === "flip") this.landingDust = 0.8;
    if (event.type === "start") {
      this.trailPoints.length = 0;
      this.lastTrail = 0;
    }
  }
  render(state, dt, input = {}) {
    if (this.disposed) return;
    const menu = state.phase === "menu",
      compact = this.width < 700,
      running = state.phase === "playing";
    if (menu || running) this.time += dt;
    if (this.seed !== state.seed) {
      this.seed = state.seed;
      this.terrainChunks.reset(state.seed);
      this.trailPoints = [];
      this.lastTrail = 0;
      this.snapCamera = true;
    }
    const p = state.position;
    const newOrigin = new THREE.Vector3(
      Math.floor(p.x / 128) * 128,
      Math.floor(p.y / 128) * 128,
      Math.floor(p.z / 128) * 128,
    );
    if (!newOrigin.equals(this.origin)) {
      const delta = newOrigin.clone().sub(this.origin);
      this.camera.position.sub(delta);
      this.lookAt.sub(delta);
      this.origin.copy(newOrigin);
    }
    this.terrainChunks.update(p, this.origin, this.quality, state.velocity);
    this.updateEntities(state);
    const o = this.origin,
      px = p.x - o.x,
      pz = p.z - o.z,
      py = p.y - o.y;
    this.player.position.set(
      px + (menu ? 8 : 0),
      menu ? this.groundHeight(p.x + 8, p.z - 5) - o.y : py,
      pz + (menu ? -5 : 0),
    );
    this.player.scale.setScalar(menu ? (compact ? 2 : 2.4) : 1);
    const steer = menu || state.recovering ? 0 : input.steer || 0;
    this.player.rotation.y = menu ? -0.65 : -state.heading;
    const pose = getSkierPose(state, { menu, steer, time: this.time });
    this.skier.rotation.set(pose.pitch, 0, pose.roll, "XYZ");
    this.skier.position.set(pose.offsetX, pose.offsetY, pose.offsetZ);
    this.penguin.visible = state.penguin > 0 && !menu && !state.recovering;
    this.shieldMesh.visible =
      (state.shield > 0 || state.invincible > 0) && !menu && !state.recovering;
    this.skier.visible = true;
    if (running && !input.observing)
      this.orbit = THREE.MathUtils.damp(this.orbit, 0, 1.5, dt);
    const heading = state.heading + this.orbit,
      fx = Math.sin(heading),
      fz = -Math.cos(heading);
    const desired = new THREE.Vector3(),
      look = new THREE.Vector3();
    if (menu) {
      desired.set(px + (compact ? 16 : 16), py + 10, pz + (compact ? 29 : 22));
      look.set(px + (compact ? 1 : -8), py, pz - 12);
    } else {
      const back = compact ? 13.5 : 17;
      desired.set(
        px - fx * back + Math.cos(heading) * 1.1,
        py + 7.2,
        pz - fz * back + Math.sin(heading) * 1.1,
      );
      desired.y = Math.max(
        desired.y,
        this.groundHeight(desired.x + o.x, desired.z + o.z) - o.y + 3.3,
      );
      const ax = p.x + fx * 17,
        az = p.z + fz * 17;
      look.set(
        px + fx * 17,
        Math.max(py - 4, this.groundHeight(ax, az) - o.y + 2),
        pz + fz * 17,
      );
      if (!state.grounded) look.y = py + 1;
      // Raise the camera until the complete shoulder-to-camera segment clears terrain.
      for (let pass = 0; pass < 3; pass++)
        for (let i = 1; i <= 8; i++) {
          const t = i / 8,
            x = px + (desired.x - px) * t,
            z = pz + (desired.z - pz) * t,
            y = py + 1.8 + (desired.y - py - 1.8) * t;
          const h = this.groundHeight(x + o.x, z + o.z) - o.y + 0.8;
          if (h > y) desired.y += (h - y) / Math.max(0.2, t);
        }
    }
    const damping = this.snapCamera ? 1 : 1 - Math.exp(-dt * 5.5);
    this.camera.position.lerp(desired, damping);
    this.lookAt.lerp(look, damping);
    this.snapCamera = false;
    this.camera.position.y = Math.max(
      this.camera.position.y,
      this.groundHeight(
        this.camera.position.x + o.x,
        this.camera.position.z + o.z,
      ) -
        o.y +
        1.8,
    );
    const motion = this.motion && !this.reducedMotion;
    if (running) this.shake = Math.max(0, this.shake - dt);
    this.camera.lookAt(this.lookAt);
    if (motion && !menu) this.camera.rotateZ(-steer * 0.012);
    this.camera.fov = THREE.MathUtils.damp(
      this.camera.fov,
      menu
        ? 47
        : (compact ? 60 : 52) +
            (state.boosting && motion ? 5 : 0) +
            Math.min(3, state.y * 0.05),
      4,
      dt,
    );
    this.camera.updateProjectionMatrix();
    this.environment.updateOpen(
      state.environment,
      this.origin,
      this.time,
      this.player.position,
      state.heading,
    );
    this.contact.position.set(
      this.player.position.x,
      this.groundHeight(p.x + (menu ? 8 : 0), p.z + (menu ? -5 : 0)) -
        o.y +
        0.03,
      this.player.position.z,
    );
    const normal = sampleTerrain(p.x, p.z, this.seed).normal;
    this.contact.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(normal.x, normal.y, normal.z),
    );
    this.contact.scale.setScalar(menu ? 2.2 : 1);
    this.contact.material.uniforms.opacity.value = Math.max(
      0,
      0.22 - state.y * 0.04,
    );
    const weather = state.environment,
      snow = this.snow.geometry.attributes.position,
      count = QUALITY[this.quality].snow;
    this.snow.position.set(px, py, pz);
    this.snow.visible = weather.snow > 0.025;
    for (let i = 0; i < count; i++) {
      const t = this.time,
        spread = 80;
      snow.setXYZ(
        i,
        ((hash(i + 210) * spread + t * (0.3 + weather.wind * 8)) % spread) - 40,
        ((((hash(i + 760) * 35 - t * 3) % 35) + 35) % 35) - 4,
        hash(i + 521) * 90 - 45,
      );
    }
    this.snow.material.uniforms.opacity.value = 0.25 + weather.snow * 0.45;
    this.snow.geometry.setDrawRange(
      0,
      Math.ceil(count * (0.15 + 0.85 * weather.snow)),
    );
    snow.needsUpdate = true;
    if (running) {
      if (!this.wasGrounded && state.grounded) this.landingDust = 0.8;
      this.landingDust = Math.max(0, this.landingDust - dt);
      this.wasGrounded = state.grounded;
    }
    this.dust.visible =
      !menu && ((state.grounded && state.speed > 2) || this.landingDust > 0);
    const dust = this.dust.geometry.attributes.position,
      dfx = Math.sin(state.heading),
      dfz = -Math.cos(state.heading);
    this.dust.geometry.setDrawRange(
      0,
      this.quality === "low" ? 65 : dust.count,
    );
    for (let i = 0; i < dust.count; i++) {
      const age = (this.time * 1.6 + hash(i)) % 1,
        side =
          (hash(i + 2) - 0.5) *
          age *
          (1.6 + Math.abs(steer) * 3 + this.landingDust * 7),
        x = p.x - dfx * age * 6 + Math.cos(state.heading) * side,
        z = p.z - dfz * age * 6 + Math.sin(state.heading) * side;
      dust.setXYZ(
        i,
        x - o.x,
        this.groundHeight(x, z) -
          o.y +
          age * (0.5 + hash(i) * 1.6 + this.landingDust * 2),
        z - o.z,
      );
    }
    dust.needsUpdate = true;
    const cells = (state.avalancheEvents || []).flatMap((e) =>
        e.cells.map((c) => ({ ...c, active: e.active })),
      ),
      av = this.avalanche.geometry.attributes.position;
    this.avalanche.visible = cells.length > 0 && !menu;
    for (let i = 0; i < av.count; i++) {
      const c = cells[i % cells.length];
      if (!c) break;
      const a = hash(i + 4) * 6.28,
        r = hash(i + 5) * c.radius;
      av.setXYZ(
        i,
        c.x - o.x + Math.cos(a) * r,
        c.y - o.y + hash(i + 19) * (c.active ? 10 : 2) + 1,
        c.z - o.z + Math.sin(a) * r,
      );
    }
    av.needsUpdate = true;
    this.updateTrails(state);
    this.post.render(
      dt,
      menu,
      this.environment.sunDirection,
      this.environment.shaftStrength,
    );
  }
  updateTrails(state) {
    if (state.phase === "playing" && state.distance - this.lastTrail > 0.45) {
      this.trailPoints.push({
        ...state.position,
        heading: state.heading,
        onGround: state.grounded,
      });
      if (this.trailPoints.length > 241) this.trailPoints.shift();
      this.lastTrail = state.distance;
    }
    const attr = this.trails.geometry.attributes.position,
      o = this.origin;
    let n = 0;
    for (let i = 1; i < this.trailPoints.length; i++) {
      const a = this.trailPoints[i - 1],
        b = this.trailPoints[i];
      if (!a.onGround || !b.onGround || Math.hypot(a.x - b.x, a.z - b.z) > 8)
        continue;
      for (const side of [-0.205, 0.205])
        for (const [p, w] of [
          [a, -0.044],
          [b, -0.044],
          [a, 0.044],
          [b, -0.044],
          [b, 0.044],
          [a, 0.044],
        ]) {
          const x = p.x + Math.cos(p.heading) * (side + w),
            z = p.z + Math.sin(p.heading) * (side + w);
          attr.setXYZ(
            n++,
            x - o.x,
            this.groundHeight(x, z) - o.y + 0.025,
            z - o.z,
          );
        }
    }
    attr.needsUpdate = true;
    this.trails.geometry.setDrawRange(0, n);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.materials.dispose();
    this.post.dispose();
    this.environment.dispose();
    this.terrainChunks.dispose();
    const geometries = new Set(),
      materials = new Set();
    this.scene.traverse((o) => {
      if (o.geometry) geometries.add(o.geometry);
      if (o.material)
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
          materials.add(m),
        );
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    this.renderer.dispose();
    this.entityMeshes.clear();
    this.entityPools.clear();
  }
}
