import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { SkiWorld } from "../src/world.js";
import { SkiGame } from "../src/game.js";

function entityWorld() {
  // 复用真实实体更新逻辑，仅省略需要浏览器 WebGL 的渲染器初始化。
  const world = Object.create(SkiWorld.prototype);
  Object.assign(world, {
    time: 0,
    scene: new THREE.Scene(),
    entityMeshes: new Map(),
    entityPools: new Map(),
    entityModel(type) {
      const mesh = new THREE.Group();
      mesh.userData.createdType = type;
      return mesh;
    },
  });
  return world;
}

test("同一实体编号换成另一障碍时替换模型并归还原类型池", () => {
  const world = entityWorld();
  world.updateEntities({
    distance: 0,
    entities: [{ id: "snow-0", type: "tree", x: 0, d: 40 }],
  });
  const original = world.entityMeshes.get("snow-0");
  world.updateEntities({
    distance: 0,
    entities: [{ id: "snow-0", type: "rock", x: 3, d: 40 }],
  });
  const replacement = world.entityMeshes.get("snow-0");
  assert.notEqual(replacement, original);
  assert.equal(replacement.userData.createdType, "rock");
  assert.equal(replacement.position.x, 3);
  assert.ok(world.entityPools.get("tree").includes(original));
  assert.equal(original.parent, null);
  assert.equal(replacement.parent, world.scene);
});

test("不同种子连续重开后所有实体模型都与碰撞类型一致", () => {
  const world = entityWorld();
  const game = new SkiGame({ seed: 1 });
  for (const seed of [1, 2, 12, 125, 42, 20260905]) {
    game.reset(seed);
    world.updateEntities(game.state);
    for (const entity of game.state.entities) {
      const mesh = world.entityMeshes.get(entity.id);
      if (
        Math.hypot(
          entity.x - game.state.position.x,
          entity.z - game.state.position.z,
        ) > 235
      )
        continue;
      assert.ok(mesh);
      assert.equal(
        mesh.userData.createdType,
        entity.type,
        `种子 ${seed} 的 ${entity.id} 模型应匹配规则`,
      );
      assert.equal(mesh.userData.entityType, entity.type);
    }
  }
});

test("已收集对象移出场景，同类新实体复用原模型", () => {
  const world = entityWorld();
  const entity = { id: "coin-before", type: "coin", x: 0, d: 40 };
  world.updateEntities({ distance: 0, entities: [entity] });
  const original = world.entityMeshes.get(entity.id);
  entity.collected = true;
  world.updateEntities({ distance: 0, entities: [entity] });
  assert.equal(world.entityMeshes.size, 0);
  assert.equal(original.parent, null);
  assert.equal(world.entityPools.get("coin").length, 1);
  world.updateEntities({
    distance: 0,
    entities: [{ id: "coin-after", type: "coin", x: -3, d: 50 }],
  });
  assert.equal(world.entityMeshes.get("coin-after"), original);
  assert.equal(original.position.x, -3);
  assert.equal(original.position.z, -50);
  assert.equal(world.entityPools.get("coin").length, 0);
});
