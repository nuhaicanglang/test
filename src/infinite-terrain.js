import * as THREE from "three";
import { generatePatch, selectPatches, patchKey } from "./terrain-patch.js";
import { mountainHeight } from "./mountain-field.js";
export class InfiniteTerrain {
  constructor(scene, material) {
    this.scene = scene;
    this.material = material;
    this.chunks = new Map();
    this.cache = new Map();
    this.queue = [];
    this.busy = false;
    this.version = 0;
    this.worker = new Worker(new URL("./terrain-worker.js", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = (e) => this.complete(e.data);
    this.worker.onerror = () => {
      this.workerFailed = true;
      this.busy = false;
      this.layout = "";
    };
  }
  reset(seed) {
    this.seed = seed;
    this.version++;
    this.queue = [];
    this.busy = false;
    for (const c of this.chunks.values()) {
      this.scene.remove(c.mesh);
      c.mesh.geometry.dispose();
    }
    for (const c of this.cache.values()) c.mesh.geometry.dispose();
    this.chunks.clear();
    this.cache.clear();
    this.layout = "";
  }
  create(p, data) {
    const g = new THREE.BufferGeometry();
    for (const key of ["position", "normal", "color", "uv"])
      g.setAttribute(
        key,
        new THREE.BufferAttribute(data[key], key === "uv" ? 2 : 3),
      );
    g.setIndex(new THREE.BufferAttribute(data.index, 1));
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, this.material);
    mesh.receiveShadow = true;
    mesh.frustumCulled = true;
    const chunk = { ...p, base: data.base, mesh };
    this.chunks.set(patchKey(p), chunk);
    this.scene.add(mesh);
    return chunk;
  }
  update(position, origin, quality, velocity = { x: 0, z: 0 }) {
    this.origin = origin;
    this.quality = quality;
    const x = position.x,
      z = position.z,
      layout = `${Math.floor(x / 32)}:${Math.floor(z / 32)}:${quality}`;
    if (layout !== this.layout) {
      this.layout = layout;
      this.wanted = selectPatches(
        x + velocity.x * 1.5,
        z + velocity.z * 1.5,
        quality,
      );
      this.wantedKeys = new Set(this.wanted.map(patchKey));
      this.queue = this.wanted.filter(
        (p) => !this.chunks.has(patchKey(p)) && !this.cache.has(patchKey(p)),
      );
      for (const p of this.wanted) {
        const key = patchKey(p);
        if (this.cache.has(key)) {
          const c = this.cache.get(key);
          this.cache.delete(key);
          this.chunks.set(key, c);
          this.scene.add(c.mesh);
        }
      }
      // Install only a tiny synchronous safety patch at a new spawn; other geometry is worker-built.
      if (!this.chunks.size) {
        const p =
          this.wanted.find(
            (p) =>
              x >= p.x && x <= p.x + p.size && z >= p.z && z <= p.z + p.size,
          ) || this.wanted[0];
        this.create(p, generatePatch(p, this.seed, 32));
      }
    }
    this.pump();
    this.retire();
    for (const c of this.chunks.values())
      c.mesh.position.set(c.x - origin.x, c.base - origin.y, c.z - origin.z);
  }
  pump() {
    if (this.busy || !this.queue.length || this.disposed) return;
    let patch = this.queue.shift();
    while (patch && this.chunks.has(patchKey(patch)))
      patch = this.queue.shift();
    if (!patch) return;
    this.busy = true;
    this.pending = patch;
    const job = {
      id: patchKey(patch),
      version: this.version,
      patch,
      seed: this.seed,
      segments: this.quality === "low" ? 20 : 32,
    };
    if (this.workerFailed) {
      this.complete({
        ...job,
        mesh: generatePatch(patch, this.seed, job.segments),
      });
    } else this.worker.postMessage(job);
  }
  complete(data) {
    if (data.version !== this.version || this.disposed) return;
    this.busy = false;
    if (data.error) {
      this.workerFailed = true;
      return;
    }
    const p = this.pending;
    if (p && this.wantedKeys?.has(data.id) && !this.chunks.has(data.id))
      this.create(p, data.mesh);
    if (!this.workerFailed) this.pump();
  }
  retire() {
    if (!this.wanted) return;
    for (const c of this.chunks.values()) c.mesh.visible = true;
    for (const [key, c] of this.chunks)
      if (!this.wantedKeys.has(key)) {
        const replacements = this.wanted.filter(
          (p) =>
            p.x < c.x + c.size &&
            p.x + p.size > c.x &&
            p.z < c.z + c.size &&
            p.z + p.size > c.z,
        );
        if (replacements.some((p) => !this.chunks.has(patchKey(p)))) {
          for (const p of replacements) {
            const child = this.chunks.get(patchKey(p));
            if (child && p.size < c.size) child.mesh.visible = false;
          }
          continue;
        }
        this.scene.remove(c.mesh);
        this.chunks.delete(key);
        this.cache.set(key, c);
      }
    while (this.cache.size > 64) {
      const [key, c] = this.cache.entries().next().value;
      c.mesh.geometry.dispose();
      this.cache.delete(key);
    }
  }
  get ready() {
    return (
      this.wanted?.every(
        (p) => p.size >= 256 || this.chunks.has(patchKey(p)),
      ) || false
    );
  }
  canEnter(x, z) {
    for (const c of this.chunks.values())
      if (
        c.size <= 128 &&
        x >= c.x &&
        x <= c.x + c.size &&
        z >= c.z &&
        z <= c.z + c.size
      )
        return true;
    return false;
  }
  get panoramaReady() {
    return this.wanted?.every((p) => this.chunks.has(patchKey(p))) || false;
  }
  dispose() {
    this.disposed = true;
    this.worker.terminate();
    for (const c of [...this.chunks.values(), ...this.cache.values()]) {
      this.scene.remove(c.mesh);
      c.mesh.geometry.dispose();
    }
    this.chunks.clear();
    this.cache.clear();
    this.queue = [];
  }
}
