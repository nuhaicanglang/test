import test from 'node:test';
import assert from 'node:assert/strict';

const terrain = await import('../src/terrain.js').catch(() => ({}));

test('雪道含真实上坡、陡降及四十米级的坡顶落差', () => {
  assert.equal(typeof terrain.terrainHeight, 'function', '应导出真实地形函数');
  const slopes = Array.from({ length: 360 }, (_, d) => terrain.terrainSlope(d));
  assert.ok(Math.max(...slopes) > 0.5, '应有明显上坡蓄力段');
  assert.ok(Math.min(...slopes) < -1, '应有超过四十五度的陡降');
  assert.ok(terrain.terrainHeight(160) - terrain.terrainHeight(230) > 40);
});

test('坡顶曲率能够在正常滑速下产生自然离地', () => {
  assert.equal(typeof terrain.terrainCurvature, 'function');
  const curvature = Array.from({ length: 24 }, (_, i) => terrain.terrainCurvature(150 + i));
  assert.ok(Math.min(...curvature) * 25 ** 2 < -22);
});

test('相邻雪道段的高度与坡度连续，远距离计算仍有限', () => {
  assert.equal(typeof terrain.terrainSlope, 'function');
  for (const boundary of [0, 45, 90, 125, 154, 164, 174, 206, 250, 300, 360, 720, 1080, 1440]) {
    assert.ok(Math.abs(terrain.terrainHeight(boundary - 0.001) - terrain.terrainHeight(boundary + 0.001)) < 0.01);
    assert.ok(Math.abs(terrain.terrainSlope(boundary - 0.001) - terrain.terrainSlope(boundary + 0.001)) < 0.01);
  }
  for (const d of [-200, 0, 100000, 1e6]) {
    assert.ok(Number.isFinite(terrain.terrainHeight(d)));
    assert.ok(Number.isFinite(terrain.terrainSlope(d)));
    assert.ok(Number.isFinite(terrain.terrainCurvature(d)));
  }
});

test('不同路段有不同高差且坡顶预告距离正确', () => {
  assert.equal(typeof terrain.terrainFeature, 'function');
  const first = terrain.terrainFeature(130);
  const second = terrain.terrainFeature(480);
  assert.equal(first.crestDistance, 160);
  assert.equal(first.nextCrestDistance, 30);
  assert.equal(second.crestDistance, 520);
  assert.notEqual(first.label, second.label);
  assert.ok(second.dropHeight > first.dropHeight);
});
