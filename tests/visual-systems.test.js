import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { normalizeQuality, defaultQuality } from "../src/quality.js";
import { readSave } from "../src/save.js";
import { MaterialLibrary } from "../src/materials.js";

// Terrain topology and pooling coverage now lives in open-world.test.js and browser QA.
test("旧画质与存档迁移保留金币、装扮和用户选择", () => {
  assert.equal(normalizeQuality("medium"), "high");
  for (const q of ["low", "high", "ultra"])
    assert.equal(normalizeQuality(q), q);
  const save = readSave({
    getItem: () =>
      JSON.stringify({
        quality: "medium",
        totalCoins: 333,
        skin: "violet",
        bestDistance: 999,
        motion: false,
      }),
  });
  assert.equal(save.quality, "high");
  assert.equal(save.skin, "violet");
  assert.equal(save.totalCoins, 333);
  assert.equal(save.bestDistance, 999);
  assert.equal(save.motion, false);
  const previous = globalThis.matchMedia;
  try {
    globalThis.matchMedia = () => ({ matches: true });
    assert.equal(defaultQuality(), "low");
    assert.equal(readSave({ getItem: () => null }).quality, "low");
  } finally {
    globalThis.matchMedia = previous;
  }
});
const renderer = { capabilities: { getMaxAnisotropy: () => 8 } };
function fakeLoader(fails = () => false) {
  const allocations = [];
  return {
    allocations,
    async loadAsync(url) {
      if (fails(url)) throw new Error("test failure");
      const texture = new THREE.Texture();
      texture.userData.url = url;
      texture.userData.disposed = false;
      texture.addEventListener("dispose", () => {
        texture.userData.disposed = true;
      });
      allocations.push(texture);
      return texture;
    },
  };
}
test("换画质成功后释放旧贴图，失败保留当前材质，退出释放资源", async () => {
  const loader = fakeLoader(),
    library = new MaterialLibrary(renderer, () => {}, loader);
  assert.equal(await library.load("high"), true);
  const first = [...library.textures.values()];
  assert.equal(first.length, 18);
  assert.equal(await library.load("low"), true);
  assert.ok(first.every((t) => t.userData.disposed));
  const previous = [...library.textures.values()];
  library.loader = fakeLoader((url) => url.includes("snow-color"));
  assert.equal(await library.load("ultra"), false);
  assert.deepEqual([...library.textures.values()], previous);
  assert.ok(previous.every((t) => !t.userData.disposed));
  library.dispose();
  assert.ok(previous.every((t) => t.userData.disposed));
  assert.equal(library.textures.size, 0);
});
test("过期的并发加载不会覆盖最新档位，也不会泄漏纹理", async () => {
  const loader = fakeLoader(),
    library = new MaterialLibrary(renderer, () => {}, loader);
  const [a, b] = await Promise.all([
    library.load("ultra"),
    library.load("low"),
  ]);
  assert.equal(a, false);
  assert.equal(b, true);
  const active = new Set(library.textures.values());
  for (const t of loader.allocations)
    assert.equal(t.userData.disposed, !active.has(t));
  assert.ok([...active].every((t) => t.userData.url.includes("1k")));
  library.dispose();
});
