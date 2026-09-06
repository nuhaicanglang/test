import test from "node:test";
import assert from "node:assert/strict";
import { SkiGame, sampleTerrain } from "../src/game.js";
import { fresh, advance, airborne, landNext, entity } from "./fixtures.js";
import { EntityField, generateEntities } from "../src/spatial-entities.js";

test("公开接口提供真实二维位置，初始化为菜单", () => {
  const g = new SkiGame();
  assert.equal(g.state.phase, "menu");
  assert.equal(g.state.mode, "freeride");
  assert.equal(g.state.distance, 0);
  assert.ok(Number.isFinite(sampleTerrain(500, -700).height));
});
test("同种子实体一致，出生点四周六十五米内没有障碍", () => {
  const a = new SkiGame({ seed: 125 }),
    b = new SkiGame({ seed: 125 });
  assert.deepEqual(a.state.entities, b.state.entities);
  assert.ok(a.state.entities.length > 15);
  assert.ok(a.state.entities.every((e) => Math.hypot(e.x, e.z) >= 65));
  assert.ok(a.state.entities.some((e) => e.x > 8));
  assert.ok(a.state.entities.some((e) => e.x < -8));
});
test("暂停同时冻结位置、天气和雪崩，恢复与重置保留接口", () => {
  const g = fresh();
  advance(g, 0.3);
  g.pause();
  const before = structuredClone(g.state);
  advance(g, 1);
  assert.deepEqual(g.state, before);
  g.resume();
  advance(g, 0.2);
  assert.ok(g.state.distance > before.distance);
  g.reset();
  assert.equal(g.state.phase, "menu");
  assert.equal(g.state.coins, 0);
});
test("无效帧不移动；持续转向能越过旧边界且朝向可完整掉头", () => {
  const g = fresh();
  g.update(NaN);
  g.update(-1);
  assert.equal(g.state.distance, 0);
  g.update(100);
  assert.ok(g.state.distance < 2);
  advance(g, 2, { steer: 1, boost: true });
  assert.ok(g.state.position.x > 8);
  const h = g.state.heading;
  advance(g, 0.2);
  assert.equal(g.state.heading, h);
  advance(g, 2, { steer: 1 });
  assert.ok(g.state.heading < 0, "转过 PI 后角度回绕，未受到半圆限制");
});
test("上坡借惯性后减速，刹停与撑杖能够重新起步", () => {
  const g = fresh(0.3);
  g.state.heading = Math.PI;
  g.state.velocity.z = 10;
  g.state.speed = 10;
  advance(g, 1);
  assert.ok(g.state.speed < 10);
  assert.ok(g.state.position.z > 0);
  const flat = fresh(0);
  advance(flat, 3, { brake: 1 });
  assert.equal(flat.state.speed, 0);
  advance(flat, 1, { tuck: 1 });
  assert.ok(flat.state.speed > 2);
});
test("冰面侧向惯性比粉雪持续更久", () => {
  const snow = fresh(0, "powder"),
    ice = fresh(0, "ice");
  for (const g of [snow, ice]) g.state.velocity = { x: 10, y: 0, z: 0 };
  advance(snow, 0.5);
  advance(ice, 0.5);
  assert.ok(ice.state.velocity.x > snow.state.velocity.x * 2);
});
test("斜向高速扫过金币只领取一次", () => {
  const g = fresh(0);
  g.state.velocity = { x: 35, y: 0, z: -35 };
  g.state.heading = Math.PI / 4;
  g.state.speed = 50;
  const e = entity("coin", 1, -1);
  g._testEntities = [e];
  g.update(0.05);
  assert.equal(g.state.coins, 1);
  g.update(0.05);
  assert.equal(g.state.coins, 1);
  assert.equal(g.drainEvents().filter((e) => e.type === "coin").length, 1);
});
test("高速碰撞一次后进入恢复和无敌窗口", () => {
  const g = fresh(0);
  g.state.velocity.z = -50;
  g.state.speed = 50;
  g._testEntities = [entity("rock", 0, -2), entity("tree", 0, -3)];
  g.update(0.05);
  assert.equal(g.state.crashes, 1);
  assert.ok(g.state.recovering > 0);
  g._testEntities = [];
  advance(g, 1.05);
  assert.ok(g.state.invincible > 0);
});
test("低空越过石块横木，但不能穿过树干", () => {
  for (const type of ["rock", "log", "tree"]) {
    const g = airborne(2.2);
    g._testEntities = [entity(type, 0, 0)];
    g.update(0.05);
    assert.equal(g.state.crashes, type === "tree" ? 1 : 0);
  }
});
test("空中重复跳跃不会重置垂直速度，最终接触地面", () => {
  const g = fresh(0);
  g.update(1 / 60, { jump: true });
  const initial = g.state.vy;
  advance(g, 0.15, { jump: true });
  assert.ok(g.state.vy < initial);
  advance(g, 1.1);
  assert.equal(g.state.y, 0);
  assert.equal(g.drainEvents().filter((e) => e.type === "jump").length, 1);
});
test("天然坡唇和手动跳跃共用完整空翻落地奖励", () => {
  const g = airborne(30);
  advance(g, 0.7, { flip: 1 });
  advance(g, 0.8);
  landNext(g);
  g.update(0.01);
  assert.equal(g.state.flips, 1);
  assert.equal(g.state.crashes, 0);
  assert.ok(g.drainEvents().some((e) => e.type === "flip"));
});
test("未回正落地摔倒，不以抽象雪崩计时立即结束", () => {
  const g = airborne();
  g.state.rotation = Math.PI;
  landNext(g);
  g.update(0.05);
  assert.equal(g.state.crashes, 1);
  assert.equal(g.state.phase, "playing");
  assert.ok(g.state.recovering > 0);
});
test("护盾阻挡碰撞，磁铁从侧面吸取金币", () => {
  const g = fresh(0);
  g.state.shield = 10;
  g._testEntities = [entity("tree", 0, 0)];
  g.update(0.01);
  assert.equal(g.state.crashes, 0);
  assert.equal(g.state.shield, 0);
  g.state.magnet = 10;
  g._testEntities = [entity("coin", 4, 0)];
  g.update(0.01);
  assert.equal(g.state.coins, 1);
});
test("企鹅保持限时保护，冲刺消耗能量并提高速度", () => {
  const g = fresh();
  g.state.penguin = 8;
  g._testEntities = [entity("tree", 0, 0)];
  advance(g, 0.5, { boost: true });
  assert.equal(g.state.crashes, 0);
  assert.ok(g.state.energy < 100);
  assert.ok(g.state.speed > 8);
  assert.ok(g.state.boosting);
});
test("没有空间接触时，安全指标为零也不能结束游戏", () => {
  const g = fresh();
  g.state.avalanche = 0;
  advance(g, 1);
  assert.equal(g.state.phase, "playing");
  g.endRun("被雪崩卷入");
  g.endRun("重复");
  assert.equal(g.drainEvents().filter((e) => e.type === "gameover").length, 1);
});
test("区块折返和不同加载顺序保持实体稳定，收集状态不随模型回收丢失", () => {
  const f = new EntityField(32);
  const original = f.update(100, 100);
  const coin = original.find((e) => e.type === "coin");
  assert.ok(coin);
  f.collect(coin);
  f.update(5000, 5000);
  const back = f.update(100, 100);
  assert.ok(!back.some((e) => e.id === coin.id));
  assert.deepEqual(generateEntities(-3, 7, 32), generateEntities(-3, 7, 32));
  assert.ok(f.tiles.size <= 81);
});
