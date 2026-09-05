import test from 'node:test';
import assert from 'node:assert/strict';
import { SkiGame, terrainHeight } from '../src/game.js';

function fresh() {
  const game = new SkiGame({ seed: 7 });
  game.start();
  game.state.entities = [];
  game._nextRow = 100000;
  game._nextObstacle = 100000;
  game._nextPowerup = 100000;
  game._nextRamp = 100000;
  return game;
}

function advance(game, seconds, input = {}) {
  for (let frame = 0; frame < Math.round(seconds * 120); frame += 1) game.update(1 / 120, input);
}

function airborne(height = 90) {
  const game = fresh();
  Object.assign(game.state, { y: height, vy: 0, grounded: false });
  return game;
}

test('空中高度由世界弹道减去当前位置地形得到', () => {
  const game = airborne(30);
  Object.assign(game.state, { distance: 180, speed: 27, vy: 4 });
  const before = terrainHeight(game.state.distance) + game.state.y;
  game.update(0.05);
  const after = terrainHeight(game.state.distance) + game.state.y;
  assert.ok(Math.abs(after - (before + 4 * 0.05 - 10 * 0.05 ** 2)) < 0.002);
});

test('自然坡顶无需跳跃便会离地并在大落差上腾空', () => {
  const game = fresh();
  let maxHeight = 0;
  let maxAirTime = 0;
  for (let frame = 0; frame < 2400 && game.state.distance < 310; frame += 1) {
    game.update(1 / 120);
    maxHeight = Math.max(maxHeight, game.state.y);
    maxAirTime = Math.max(maxAirTime, game.state.airTime);
    assert.ok(game.state.y >= 0, '不能穿进山体');
  }
  assert.ok(game.drainEvents().some(event => event.type === 'terrain'));
  assert.ok(maxHeight >= 20, `主坡腾空应达到二十米，实际 ${maxHeight}`);
  assert.ok(maxAirTime >= 2.5, `主坡腾空应达到两秒半，实际 ${maxAirTime}`);
  assert.equal(game.state.crashes, 0, '不翻转的自然落地应保持安全');
});

test('前后空翻和左右滚转都按完整圈计分，混合技巧有额外奖励', () => {
  for (const direction of [-1, 1]) {
    const game = airborne();
    advance(game, 1.5, { flip: direction, roll: direction });
    assert.ok(game.state.pitchTurns >= 2);
    assert.ok(game.state.rollTurns >= 2);
    assert.equal(game.state.airTurns, game.state.pitchTurns + game.state.rollTurns);
    const turns = game.state.airTurns;
    assert.equal(game.state.airScore, Math.round(75 * turns * (turns + 1) * 1.25));
    assert.equal(game.state.flips, 0, '着地前不可入账');
    advance(game, 0.8);
    Object.assign(game.state, { y: 0.005, vy: -80 });
    game.update(0.01);
    assert.equal(game.state.flips, turns);
    assert.equal(game.state.crashes, 0);
    assert.equal(game.state.airScore, 0);
  }
});

test('反向来回摆动和自动回正不得把未完成的圈记入得分', () => {
  const game = airborne(250);
  for (let repeat = 0; repeat < 5; repeat += 1) {
    advance(game, 0.4, { flip: 1, roll: -1 });
    advance(game, 0.4, { flip: -1, roll: 1 });
  }
  assert.equal(game.state.airTurns, 0);
  advance(game, 0.4, { flip: 1 });
  advance(game, 0.4);
  assert.equal(game.state.airScore, 0, '松开后补齐的角度不能制造得分');
});

test('重复短按后自动回正不能把零散角度拼成完整圈', () => {
  for (const direction of [-1, 1]) {
    const game = airborne(1000);
    for (let repeat = 0; repeat < 8; repeat += 1) {
      advance(game, 0.2, { flip: direction, roll: direction });
      assert.ok(Math.abs(game.state.rotation) < Math.PI);
      assert.ok(Math.abs(game.state.rollRotation) < Math.PI);
      advance(game, 0.5);
      assert.equal(game.state.pitchTurns, 0);
      assert.equal(game.state.rollTurns, 0);
      assert.equal(game.state.airScore, 0, '没有真正完成整圈时应始终零分');
    }
  }
});

test('已完成的圈保留，改变方向后完整手动再转一圈可以继续计分', () => {
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
    Object.assign(game.state, { y: 0.005, vy: -80 });
    game.update(0.01);
    assert.equal(game.state.flips, 4);
    assert.equal(game.state.crashes, 0);
  }
});

test('摔倒按最高离地高度分档，冻结输入并让雪崩在恢复期持续追近', () => {
  const tiers = [[2, 1, 1, 5], [7, 2, 1.8, 9], [15, 3, 2.8, 14], [28, 4, 4, 20]];
  for (const [height, tier, duration, penalty] of tiers) {
    const game = airborne();
    Object.assign(game.state, {
      airHeightPeak: height, y: 0.005, vy: -40, rotation: Math.PI,
      shield: 10, penguin: 10, invincible: 10, combo: 4,
    });
    game.update(0.01, { flip: true });
    assert.equal(game.state.crashes, 1, '道具和碰撞无敌不能免掉空翻摔倒');
    assert.equal(game.state.crashTier, tier);
    assert.equal(game.state.recoveryTotal, duration);
    assert.ok(game.state.recovering > duration - 0.02);
    assert.equal(game.state.combo, 0);
    assert.ok(game.state.avalanche <= 80 - penalty);
    const before = { x: game.state.x, avalanche: game.state.avalanche };
    advance(game, 0.5, { steer: 1, flip: 1, roll: 1, jump: true, boost: true });
    assert.equal(game.state.x, before.x);
    assert.equal(game.state.boosting, false);
    assert.equal(game.state.y, 0);
    assert.ok(game.state.speed <= 8);
    assert.ok(game.state.avalanche < before.avalanche - 4);
    advance(game, duration);
    assert.equal(game.state.recovering, 0);
    assert.ok(game.state.invincible > 0);
    const crash = game.drainEvents().find(event => event.type === 'crash');
    assert.equal(crash.tier, tier);
    assert.equal(crash.height, height);
    assert.equal(crash.duration, duration);
  }
});

test('稀疏道具依次出现，首段宽容而障碍始终保留通路', () => {
  const game = new SkiGame({ seed: 101 });
  const powers = ['shield', 'magnet', 'penguin'];
  assert.ok(game.state.entities.filter(entity => powers.includes(entity.type)).length <= 1);
  assert.ok(game.state.entities.filter(entity => ['tree', 'rock', 'log'].includes(entity.type)).every(entity => entity.d >= 160));
  game.state.distance = 900;
  game._generate();
  const entities = game.state.entities.filter(entity => entity.d < 1000);
  const powerups = entities.filter(entity => powers.includes(entity.type));
  assert.ok(powerups.length <= 4);
  assert.deepEqual(powerups.slice(0, 3).map(entity => entity.type), powers);
  assert.ok(entities.filter(entity => entity.type === 'coin').length <= 64);
  assert.ok(entities.filter(entity => entity.type === 'ramp').length <= 4);
  const rows = new Map();
  for (const entity of entities.filter(entity => ['tree', 'rock', 'log'].includes(entity.type))) {
    rows.set(entity.d, (rows.get(entity.d) || 0) + 1);
  }
  assert.ok([...rows.values()].every(count => count <= 2));
});

test('分批生成与一次生成一致，沿金币路线始终能够避开每排障碍', () => {
  const once = new SkiGame({ seed: 392 });
  once.state.distance = 900;
  once._generate();
  const batches = new SkiGame({ seed: 392 });
  for (let d = 10; d <= 900; d += 10) {
    batches.state.distance = d;
    batches._generate();
  }
  const comparable = game => game.state.entities.map(({ type, x, d }) => ({ type, x, d })).sort((a, b) => a.d - b.d || a.x - b.x || a.type.localeCompare(b.type));
  assert.deepEqual(comparable(once), comparable(batches));
  for (const entity of once.state.entities.filter(entity => ['tree', 'rock', 'log'].includes(entity.type))) {
    const section = Math.floor((entity.d - 40) / 66);
    const coin = once.state.entities.find(item => item.type === 'coin' && Math.abs(item.d - (40 + section * 66)) < 0.01);
    assert.ok(coin);
    assert.notEqual(entity.x, coin.x, `${entity.d} 米障碍不能占用同段金币路线`);
  }
});

test('高飞坡可以从树冠上方安全跃过，低空仍会撞到树', () => {
  for (const [height, crashes] of [[2.2, 1], [10, 0], [30, 0]]) {
    const game = airborne(height);
    game.state.entities = [{ id: 'canopy', type: 'tree', x: 0, d: 0.4 }];
    game.update(0.05);
    assert.equal(game.state.crashes, crashes);
  }
});
