import test from "node:test";
import assert from "node:assert/strict";
import {
  sampleTerrain,
  mountainHeight,
  findBiome,
  regionAt,
  BIOMES,
} from "../src/mountain-field.js";
import {
  generatePatch,
  selectPatches,
  patchKey,
} from "../src/terrain-patch.js";
import { AvalancheField } from "../src/avalanche-field.js";
import { environmentState } from "../src/world-weather.js";
import { readSave, bankRun } from "../src/save.js";
import { fresh, plane, advance } from "./fixtures.js";

test("八类区域均能按固定种子找到，二维位置与坡度可重复", () => {
  const fingerprints = new Set();
  for (let i = 0; i < 8; i++) {
    const r = findBiome(i);
    assert.equal(regionAt(r.x, r.z).index, i);
    const a = sampleTerrain(r.x, r.z),
      b = sampleTerrain(r.x, r.z);
    assert.deepEqual(a, b);
    assert.ok(Number.isFinite(a.slope));
    fingerprints.add([a.height, a.gradient.x, a.gradient.z].join());
  }
  assert.equal(fingerprints.size, 8);
  assert.equal(BIOMES.length, 8);
});
test("地形跨区域边界和负坐标连续，远距离仍有限", () => {
  for (const x of [-900, -0.001, 0, 900, 999999.8])
    for (const z of [-1800, 0, 900, 1e6]) {
      const a = sampleTerrain(x - 0.0001, z),
        b = sampleTerrain(x + 0.0001, z);
      assert.ok(Number.isFinite(a.height));
      assert.ok(Math.abs(a.height - b.height) < 0.003);
      assert.ok(Math.abs(a.gradient.x - b.gradient.x) < 0.001);
      assert.ok(Math.abs(a.normal.y - b.normal.y) < 0.001);
    }
});
test("共享区块边沿高度、法线和纹理坐标完全一致", () => {
  for (const [x, z] of [
    [0, 0],
    [-128, -64],
    [999936, 999936],
  ]) {
    const a = generatePatch({ x, z, size: 64 }, 32, 8),
      b = generatePatch({ x: x + 64, z, size: 64 }, 32, 8);
    for (let j = 0; j <= 8; j++) {
      const ia = j * 9 + 8,
        ib = j * 9;
      assert.ok(
        Math.abs(
          a.position[ia * 3 + 1] + a.base - b.position[ib * 3 + 1] - b.base,
        ) < 0.00005,
      );
      assert.deepEqual(
        [...a.normal.slice(ia * 3, ia * 3 + 3)],
        [...b.normal.slice(ib * 3, ib * 3 + 3)],
      );
      assert.deepEqual(
        [...a.uv.slice(ia * 2, ia * 2 + 2)],
        [...b.uv.slice(ib * 2, ib * 2 + 2)],
      );
    }
  }
});
test("四叉树覆盖四周、没有重叠叶片，细节随距离下降", () => {
  for (const q of ["low", "high", "ultra"]) {
    const patches = selectPatches(-10, 205, q);
    assert.equal(new Set(patches.map(patchKey)).size, patches.length);
    assert.ok(patches.length < 200);
    for (const [x, z] of [
      [-10, 205],
      [90, 205],
      [-110, 205],
      [-10, 105],
      [-10, 305],
    ])
      assert.equal(
        patches.filter(
          (p) => x >= p.x && x < p.x + p.size && z >= p.z && z < p.z + p.size,
        ).length,
        1,
      );
    assert.ok(patches.some((p) => p.size === 1024));
    assert.ok(patches.some((p) => p.size === (q === "low" ? 128 : 64)));
  }
});
test("近景网格顶点严格对应物理地形，面朝上且包含接缝裙边", () => {
  const p = { x: 0, z: 0, size: 64 },
    g = generatePatch(p, 20260905, 32);
  assert.ok(g.position.length / 3 > 33 * 33);
  for (let i = 0; i < 33 * 33; i += 71)
    assert.ok(
      Math.abs(
        g.position[i * 3 + 1] +
          g.base -
          mountainHeight(g.position[i * 3], g.position[i * 3 + 2]),
      ) < 0.00002,
    );
  const [a, b, c] = g.index;
  const ax = g.position[b * 3] - g.position[a * 3],
    az = g.position[b * 3 + 2] - g.position[a * 3 + 2],
    bx = g.position[c * 3] - g.position[a * 3],
    bz = g.position[c * 3 + 2] - g.position[a * 3 + 2];
  assert.ok(az * bx - ax * bz > 0);
});
test("雪崩至少八秒预警，随后顺坡移动而不随朝向瞬移", () => {
  const a = new AvalancheField(7, (x, z) => plane(x, z, 0.5)),
    p = { x: 0, y: 0, z: 0 };
  assert.ok(a.spawn(p, 0));
  const initial = structuredClone(a.events[0]);
  assert.ok(initial.warningUntil >= 8);
  a.update(0.1, 5, p);
  assert.deepEqual(a.events[0].cells, initial.cells);
  for (let i = 0; i < 100; i++) a.update(0.1, 11 + i * 0.1, p);
  assert.ok(a.events[0].cells.every((c) => c.z < initial.cells[0].z));
  assert.ok(a.events[0].cells.every((c) => c.y <= initial.cells[0].y));
  const old = a.events[0].cells[4].z;
  a.update(0.01, 22, { ...p, x: 80 });
  assert.equal(a.events[0].cells[4].z, old);
});
test("雪崩前沿不能靠惯性跨越更高的山脊", () => {
  const sample = (x, z) => ({
    ...plane(x, z, 0.3),
    height: z < 0 ? 20 : z * 0.3,
  });
  const a = new AvalancheField(1, sample);
  a.events = [
    {
      born: 0,
      warningUntil: 0,
      active: true,
      cells: [{ x: 0, z: 0.01, y: 0.003, vx: 0, vz: -30, radius: 10 }],
    },
  ];
  a.nextEvent = 1e6;
  for (let i = 0; i < 20; i++)
    a.update(0.1, 1 + i * 0.1, { x: 100, y: 0, z: 0 });
  assert.ok(a.events[0].cells[0].z >= 0);
});
test("横切到雪崩宽度外不受覆盖，实际深度卷入才结束", () => {
  const g = fresh(0);
  g.state.velocity = { x: 0, y: 0, z: 0 };
  g.avalancheField.events = [
    {
      id: 1,
      x: 0,
      z: 0,
      born: 0,
      warningUntil: 0,
      active: true,
      cells: [{ x: 0, z: 0, y: 0, vx: 0, vz: 0, radius: 80, stopped: true }],
    },
  ];
  const off = g.avalancheField.update(0.01, 1, { x: 100, y: 0, z: 0 });
  assert.equal(off.contact, 0);
  advance(g, 1.7);
  assert.equal(g.state.phase, "over");
  assert.equal(g.drainEvents().filter((e) => e.type === "gameover").length, 1);
});
test("护盾为雪崩接触提供脱离窗口而不是修改虚构距离", () => {
  const g = fresh(0);
  g.state.velocity = { x: 0, y: 0, z: 0 };
  g.state.shield = 10;
  g.avalancheField.events = [
    {
      id: 1,
      x: 0,
      z: 0,
      born: 0,
      warningUntil: 0,
      cells: [{ x: 0, z: 0, y: 0, vx: 0, vz: 0, radius: 80, stopped: true }],
    },
  ];
  advance(g, 1);
  assert.equal(g.state.phase, "playing");
  assert.equal(g.state.shield, 0);
  assert.ok(g.state.invincible > 1);
  assert.equal(g.state.burial, 0);
});
test("昼夜一轮二十四分钟，天气连续过渡且与种子有关", () => {
  const a = environmentState(7, 0, 0, 0),
    b = environmentState(7, 1440, 0, 0);
  assert.equal(a.hour, b.hour);
  for (const t of [60, 150, 300, 450]) {
    const p = environmentState(7, t - 0.001, 0, 0),
      n = environmentState(7, t + 0.001, 0, 0);
    for (const k of ["cloud", "fog", "snow", "wind"])
      assert.ok(Math.abs(p[k] - n[k]) < 0.001);
  }
  assert.ok(environmentState(7, 0, 0, 0, "night").daylight < 0.01);
  assert.ok(environmentState(7, 0, 0, 0, "noon").daylight > 0.99);
});
test("旧纪录不被开放模式覆盖，金币与装备仍共享", () => {
  const old = readSave({
    getItem: () =>
      JSON.stringify({
        bestDistance: 2000,
        bestScore: 9000,
        totalCoins: 333,
        skin: "violet",
        quality: "medium",
        motion: false,
      }),
  });
  const next = bankRun(old, {
    mode: "freeride",
    distance: 3000,
    score: 4000,
    coins: 10,
  });
  assert.equal(next.bestDistance, 2000);
  assert.equal(next.bestScore, 9000);
  assert.equal(next.openBestDistance, 3000);
  assert.equal(next.openBestScore, 4000);
  assert.equal(next.totalCoins, 343);
  assert.equal(next.skin, "violet");
  assert.equal(next.quality, "high");
  assert.equal(next.motion, false);
  assert.equal(next.startTime, "dawn");
});
