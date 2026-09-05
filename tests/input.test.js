import test from 'node:test';
import assert from 'node:assert/strict';

const inputModule = await import('../src/input.js').catch(() => ({}));
const input = (keys = [], touches = [], extra = {}) => {
  assert.equal(typeof inputModule.buildInput, 'function');
  return inputModule.buildInput({ keys: new Set(keys), touches: new Set(touches), ...extra });
};

test('前后空翻与左右滚转可同时控制且不影响横移', () => {
  const result = input(['KeyA', 'KeyW', 'KeyE']);
  assert.equal(result.steer, -1);
  assert.equal(result.flip, -1);
  assert.equal(result.roll, 1);
  assert.equal(input(['KeyS', 'KeyQ']).flip, 1);
  assert.equal(input(['KeyS', 'KeyQ']).roll, -1);
});

test('点按跳跃不强制旋转，长按兼容后空翻且显式前翻优先', () => {
  assert.equal(input(['Space'], [], { heldMilliseconds: 20, jumpQueued: true }).jump, true);
  assert.equal(input(['Space'], [], { heldMilliseconds: 20 }).flip, 0);
  assert.equal(input(['Space'], [], { heldMilliseconds: 100 }).flip, 1);
  assert.equal(input(['Space', 'KeyW'], [], { heldMilliseconds: 100 }).flip, -1);
});

test('触屏前翻和左右滚转独立于转向，松开不遗留输入', () => {
  assert.equal(input([], ['roll-left']).roll, -1);
  assert.equal(input([], ['roll-left']).steer, 0);
  assert.equal(input([], ['frontflip', 'roll-right']).flip, -1);
  assert.equal(input([], ['frontflip', 'roll-right']).roll, 1);
  assert.equal(input([], ['left']).steer, -1);
  assert.equal(input().roll, 0);
});
