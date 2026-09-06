import test from "node:test";
import assert from "node:assert/strict";
import {
  fresh,
  advance,
  airborne,
  landNext,
  entity,
  plane,
} from "./fixtures.js";
import { SkiGame } from "../src/game.js";

test("前后空翻和左右滚转都按完整圈计分，混合技巧有额外奖励", () => {
  for (const direction of [-1, 1]) {
    const game = airborne();
    advance(game, 1.5, { flip: direction, roll: direction });
    assert.ok(game.state.pitchTurns >= 2);
    assert.ok(game.state.rollTurns >= 2);
    assert.equal(
      game.state.airTurns,
      game.state.pitchTurns + game.state.rollTurns,
    );
    const turns = game.state.airTurns;
    assert.equal(
      game.state.airScore,
      Math.round(75 * turns * (turns + 1) * 1.25),
    );
    assert.equal(game.state.flips, 0, "着地前不可入账");
    advance(game, 0.8);
    landNext(game);
    game.update(0.01);
    assert.equal(game.state.flips, turns);
    assert.equal(game.state.crashes, 0);
    assert.equal(game.state.airScore, 0);
  }
});

test("反向来回摆动和自动回正不得把未完成的圈记入得分", () => {
  const game = airborne(250);
  for (let repeat = 0; repeat < 5; repeat += 1) {
    advance(game, 0.4, { flip: 1, roll: -1 });
    advance(game, 0.4, { flip: -1, roll: 1 });
  }
  assert.equal(game.state.airTurns, 0);
  advance(game, 0.4, { flip: 1 });
  advance(game, 0.4);
  assert.equal(game.state.airScore, 0, "松开后补齐的角度不能制造得分");
});

test("重复短按后自动回正不能把零散角度拼成完整圈", () => {
  for (const direction of [-1, 1]) {
    const game = airborne(1000);
    for (let repeat = 0; repeat < 8; repeat += 1) {
      advance(game, 0.2, { flip: direction, roll: direction });
      assert.ok(Math.abs(game.state.rotation) < Math.PI);
      assert.ok(Math.abs(game.state.rollRotation) < Math.PI);
      advance(game, 0.5);
      assert.equal(game.state.pitchTurns, 0);
      assert.equal(game.state.rollTurns, 0);
      assert.equal(game.state.airScore, 0, "没有真正完成整圈时应始终零分");
    }
  }
});

test("已完成的圈保留，改变方向后完整手动再转一圈可以继续计分", () => {
  for (const direction of [-1, 1]) {
    const game = airborne(250);
    advance(game, 0.7, { flip: direction, roll: direction });
    assert.equal(game.state.pitchTurns, 1);
    assert.equal(game.state.rollTurns, 1);
    advance(game, 0.7, { flip: -direction, roll: -direction });
    assert.equal(game.state.pitchTurns, 2);
    assert.equal(game.state.rollTurns, 2);
    assert.equal(game.state.airScore, 1875);
    advance(game, 0.2);
    landNext(game);
    game.update(0.01);
    assert.equal(game.state.flips, 4);
    assert.equal(game.state.crashes, 0);
  }
});

test("世界弹道独立于斜向移动经过的地形高度", () => {
  const g = fresh(0.3);
  g.state.position.y += 30;
  g.state.velocity = { x: 12, y: 4, z: -27 };
  g.state.grounded = false;
  const before = g.state.position.y;
  g.update(0.05);
  assert.ok(
    Math.abs(g.state.position.y - (before + 4 * 0.05 - 10 * 0.05 ** 2)) < 0.002,
  );
  assert.ok(g.state.position.x > 0);
  assert.ok(
    Math.abs(
      g.state.y -
        (g.state.position.y -
          g.terrain(g.state.position.x, g.state.position.z).height),
    ) < 1e-8,
  );
});
test("天然凸坡释放法向支撑，触发起飞而非贴着陡降下沉", () => {
  const terrain = (x, z) => {
    const k = 0.08;
    const h = -12 * Math.log(Math.cosh(z * k));
    const gz = -12 * k * Math.tanh(z * k);
    const t = plane(x, z, 0);
    return {
      ...t,
      height: h,
      gradient: { x: 0, z: gz },
      normal: { x: 0, y: 1 / Math.hypot(1, gz), z: -gz / Math.hypot(1, gz) },
    };
  };
  const g = new SkiGame({ terrain });
  g.start();
  g._testEntities = [];
  g.state.velocity.z = -25;
  g.state.speed = 25;
  advance(g, 1);
  assert.ok(g.drainEvents().some((e) => e.type === "terrain"));
  assert.ok(g.state.y > 1);
});
test("落地失稳保持原恢复分档且冻结转向和冲刺", () => {
  for (const [height, tier, duration] of [
    [2, 1, 1],
    [7, 2, 1.8],
    [15, 3, 2.8],
    [28, 4, 4],
  ]) {
    const g = airborne();
    g.state.airHeightPeak = height;
    g.state.rotation = Math.PI;
    landNext(g, -40);
    g.update(0.01, { flip: 1 });
    assert.equal(g.state.crashes, 1);
    assert.equal(g.state.crashTier, tier);
    assert.equal(g.state.recoveryTotal, duration);
    const heading = g.state.heading;
    advance(g, 0.5, { steer: 1, boost: true });
    assert.equal(g.state.heading, heading);
    assert.equal(g.state.boosting, false);
    assert.equal(g.state.y, 0);
    advance(g, duration);
    assert.equal(g.state.recovering, 0);
    assert.ok(g.state.invincible > 0);
  }
});
test("高飞时越过树冠，低空不能穿树", () => {
  for (const [h, crashes] of [
    [2.2, 1],
    [10, 0],
    [30, 0],
  ]) {
    const g = airborne(h);
    g._testEntities = [entity("tree", 0, 0)];
    g.update(0.05);
    assert.equal(g.state.crashes, crashes);
  }
});
