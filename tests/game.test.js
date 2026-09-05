import test from 'node:test';
import assert from 'node:assert/strict';

const api = await import('../src/game.js').catch(() => null);

function fresh(seed = 12) {
  assert.ok(api?.SkiGame, '游戏应导出 SkiGame');
  const game = new api.SkiGame({ seed });
  game.start();
  game.state.entities = [];
  game.drainEvents();
  return game;
}

function advance(game, seconds, input = {}) {
  for (let time = 0; time < seconds; time += 1 / 60) game.update(1 / 60, input);
}

test('公开 API 初始化菜单并提供有限地形高度', () => {
  assert.ok(api?.SkiGame && api?.terrainHeight, '游戏规则模块应提供约定导出');
  const game = new api.SkiGame({ seed: 7 });
  assert.equal(game.state.phase, 'menu');
  assert.equal(game.state.avalanche, 80);
  assert.equal(game.state.distance, 0);
  assert.ok(Number.isFinite(api.terrainHeight(500)));
  assert.ok(api.terrainHeight(500) < api.terrainHeight(0));
});

test('相同种子生成相同赛道且前一百六十米无障碍', () => {
  const left = fresh(125);
  const right = fresh(125);
  left.reset(125);
  right.reset(125);
  assert.deepEqual(left.state.entities, right.state.entities);
  assert.ok(left.state.entities.length >= 15);
  assert.ok(left.state.entities.every(entity => entity.d >= 40));
  assert.ok(Math.max(...left.state.entities.map(entity => entity.d)) >= 170);
  const blockedRows = new Map();
  for (const entity of left.state.entities.filter(entity => ['tree', 'rock', 'log'].includes(entity.type))) {
    const count = (blockedRows.get(entity.d) || 0) + 1;
    blockedRows.set(entity.d, count);
    assert.ok(entity.d >= 160);
    assert.ok(count <= 2, '同一排至少保留三条可通过路线');
  }
});

test('暂停冻结物理状态，继续后推进，重置清空成绩', () => {
  const game = fresh();
  advance(game, 0.3);
  const distance = game.state.distance;
  game.pause();
  advance(game, 0.5);
  assert.equal(game.state.distance, distance);
  game.resume();
  advance(game, 0.1);
  assert.ok(game.state.distance > distance);
  game.state.coins = 4;
  game.reset();
  assert.equal(game.state.coins, 0);
  assert.equal(game.state.phase, 'menu');
});

test('超长或无效帧时间不会引发传送且横移受赛道边界限制', () => {
  const game = fresh();
  game.update(100, { steer: 1 });
  assert.ok(game.state.distance < 2);
  const before = game.state.distance;
  game.update(Number.NaN);
  game.update(-5);
  assert.equal(game.state.distance, before);
  advance(game, 3, { steer: 1 });
  assert.ok(game.state.x <= 8 && game.state.x > 6);
  advance(game, 5, { steer: -1 });
  assert.ok(game.state.x >= -8 && game.state.x < -6);
});

test('高速扫过金币仍会收集且只计一次', () => {
  const game = fresh();
  game.state.speed = 100;
  game.state.entities = [{ id: 'fast-coin', type: 'coin', x: 0, d: 2 }];
  game.update(0.05);
  assert.equal(game.state.coins, 1);
  assert.ok(game.state.score > 0);
  assert.ok(game.state.avalanche > 80);
  game.update(0.05);
  assert.equal(game.state.coins, 1);
  assert.equal(game.drainEvents().filter(event => event.type === 'coin').length, 1);
});

test('高速扫过障碍触发一次碰撞，先趴地再进入无敌恢复窗口', () => {
  const game = fresh();
  game.state.speed = 100;
  game.state.entities = [
    { id: 'rock', type: 'rock', x: 0, d: 2 },
    { id: 'tree', type: 'tree', x: 0, d: 3 },
  ];
  game.update(0.05);
  assert.equal(game.state.crashes, 1);
  assert.ok(game.state.recovering > 0);
  assert.equal(game.state.invincible, 0);
  assert.ok(game.state.avalanche < 75);
  assert.equal(game.state.phase, 'playing');
  advance(game, 1.05);
  assert.ok(game.state.invincible > 0);
});

test('空中越过石块和横木但不能穿过树', () => {
  for (const type of ['rock', 'log', 'tree']) {
    const game = fresh();
    game.state.y = 2.2;
    game.state.vy = 0;
    game.state.grounded = false;
    game.state.entities = [{ id: type, type, x: 0, d: 0.5 }];
    game.update(0.05);
    assert.equal(game.state.crashes, type === 'tree' ? 1 : 0);
  }
});

test('跳跃上升后落地，空中重复跳跃不会重置速度', () => {
  const game = fresh();
  game.update(1 / 60, { jump: true });
  const initialVelocity = game.state.vy;
  assert.ok(game.state.y > 0);
  advance(game, 0.15, { jump: true });
  assert.ok(game.state.vy < initialVelocity);
  advance(game, 1.1);
  assert.equal(game.state.y, 0);
  assert.equal(game.state.grounded, true);
  assert.equal(game.drainEvents().filter(event => event.type === 'jump').length, 1);
});

test('坡道支持完整空翻，松开后回正落地获得奖励', () => {
  const game = fresh();
  game.state.entities = [{ id: 'ramp', type: 'ramp', x: 0, d: 0.5 }];
  game.update(0.05);
  assert.ok(game.state.vy > 9);
  let frames = 0;
  while (game.state.rotation < Math.PI * 2 && frames++ < 160) game.update(1 / 60, { flip: true });
  assert.ok(game.state.rotation >= Math.PI * 2);
  advance(game, 2);
  assert.ok(game.state.flips >= 1);
  assert.equal(game.state.crashes, 0);
  assert.ok(game.state.combo >= 1);
  assert.ok(game.drainEvents().some(event => event.type === 'flip'));
});

test('未回正的空翻落地会摔倒但不会立即结束', () => {
  const game = fresh();
  Object.assign(game.state, { y: 0.04, vy: -6, rotation: Math.PI, grounded: false });
  game.update(0.05, { flip: true });
  assert.equal(game.state.crashes, 1);
  assert.equal(game.state.phase, 'playing');
  assert.ok(game.state.avalanche < 75);
  assert.equal(game.state.crashTier, 1);
  assert.ok(game.state.recovering > 0);
});

test('护盾抵挡碰撞且磁铁吸收较远金币', () => {
  const game = fresh();
  game.state.entities = [{ id: 'shield', type: 'shield', x: 0, d: 0.3 }];
  game.update(0.05);
  assert.ok(game.state.shield > 0);
  game.state.entities.push({ id: 'tree', type: 'tree', x: 0, d: game.state.distance + 0.4 });
  game.update(0.05);
  assert.equal(game.state.crashes, 0);
  game.state.entities.push({ id: 'magnet', type: 'magnet', x: 0, d: game.state.distance + 0.4 });
  game.update(0.05);
  assert.ok(game.state.magnet > 0);
  game.state.entities.push({ id: 'coin', type: 'coin', x: 4, d: game.state.distance + 0.4 });
  game.update(0.05);
  assert.equal(game.state.coins, 1);
});

test('企鹅提供限时保护与加速，能量冲刺消耗能量并拉开雪崩', () => {
  const game = fresh();
  game.state.entities = [{ id: 'penguin', type: 'penguin', x: 0, d: 0.2 }];
  game.update(0.05);
  assert.ok(game.state.penguin > 7);
  const safety = game.state.avalanche;
  advance(game, 0.5, { boost: true });
  assert.ok(game.state.energy < 100);
  assert.ok(game.state.avalanche > safety);
  assert.ok(game.state.speed > 20);
  assert.equal(game.state.boosting, true);
  assert.ok(game.drainEvents().some(event => event.type === 'powerup' && event.kind === 'penguin'));
});

test('雪崩追上后只发出一次结束事件', () => {
  const game = fresh();
  game.state.avalanche = 0.001;
  game.update(0.05);
  assert.equal(game.state.phase, 'over');
  const finalDistance = game.state.distance;
  advance(game, 1);
  assert.equal(game.state.distance, finalDistance);
  const events = game.drainEvents();
  assert.equal(events.filter(event => event.type === 'gameover').length, 1);
  assert.deepEqual(game.drainEvents(), []);
});
