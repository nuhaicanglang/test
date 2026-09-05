import test from 'node:test';
import assert from 'node:assert/strict';
import { Euler, Vector3 } from 'three';
import { getSkierPose as getPose } from '../src/pose.js';

const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} ≈ ${expected}`);
const bodyCenter = (pose) => new Vector3(0, 1.1, 0)
  .applyEuler(new Euler(pose.pitch, 0, pose.roll, 'XYZ'))
  .add(new Vector3(pose.offsetX, pose.offsetY, pose.offsetZ));
const crashState = (recovering, extra = {}) => ({
  grounded: true, groundSlope: -0.18, recovering, recoveryTotal: 2.5, crashTier: 2, ...extra,
});

test('姿态函数容忍缺少状态，且不会修改输入', () => {
  const pose = getPose();
  for (const value of Object.values(pose)) assert.ok(Number.isFinite(value));
  const state = Object.freeze({ grounded: true, groundSlope: -0.3 });
  getPose(state);
  assert.deepEqual(state, { grounded: true, groundSlope: -0.3 });
});

test('贴地姿态匹配地形坡度和转向倾斜', () => {
  const pose = getPose({ grounded: true, groundSlope: -0.4 }, { steer: 0.75 });
  close(pose.pitch, Math.atan(-0.4), '坡面俯仰');
  close(pose.roll, -0.75 * 0.22, '转向倾斜');
});

test('后翻为正俯仰，前翻为负俯仰，左右滚转使用正确的世界轴方向', () => {
  const backRight = getPose({ grounded: false, rotation: 0.9, rollRotation: 0.7 });
  const frontLeft = getPose({ grounded: false, rotation: -0.9, rollRotation: -0.7 });
  close(backRight.pitch, 0.9, '后翻');
  close(frontLeft.pitch, -0.9, '前翻');
  close(backRight.roll, -0.7, '右翻');
  close(frontLeft.roll, 0.7, '左翻');
});

test('任意双轴旋转始终围绕固定的身体重心', () => {
  for (const rotation of [-8.8, -Math.PI, -0.4, 0, 0.6, 7.9]) {
    for (const rollRotation of [-7.4, -1.1, 0, 0.8, Math.PI]) {
      const pose = getPose({ grounded: false, rotation, rollRotation }, { steer: 0.4 });
      const center = bodyCenter(pose);
      close(center.x, 0, '重心水平位置');
      close(center.y, 1.1, '重心高度');
      close(center.z, 0, '重心前后位置');
    }
  }
});

test('空翻和滚转完成连续整圈后的几何姿态一致', () => {
  const base = getPose({ grounded: false, rotation: 0.35, rollRotation: -0.7 });
  const repeated = getPose({ grounded: false, rotation: 0.35 + Math.PI * 8, rollRotation: -0.7 - Math.PI * 6 });
  for (const key of ['offsetX', 'offsetY', 'offsetZ', 'centerHeight']) close(repeated[key], base[key], key);
  const head = (pose) => new Vector3(0, 2.2, 0).applyEuler(new Euler(pose.pitch, 0, pose.roll, 'XYZ'));
  assert.ok(head(base).distanceTo(head(repeated)) < 1e-9);
});

test('摔倒恢复阶段横躺雪面，重心低于站立且身体贴近雪面', () => {
  const pose = getPose(crashState(1.3));
  assert.ok(pose.roll > 1.3 && pose.roll < 1.6);
  close(pose.pitch, Math.atan(-0.18) + 0.18, '摔倒俯仰');
  close(bodyCenter(pose).y, 0.42, '躺卧重心');
  assert.ok(pose.centerHeight < getPose({ grounded: true }).centerHeight);
});

test('摔倒动画使用恢复计时，暂停时不会随全局时间继续翻滚', () => {
  const state = crashState(2.3);
  assert.deepEqual(getPose(state, { time: 0 }), getPose(state, { time: 600 }));
  assert.notDeepEqual(getPose(state), getPose(crashState(2.1)));
  assert.deepEqual(getPose(crashState(1.7)), getPose(crashState(1.3)));
});

test('最后半秒平滑起身，恢复结束后回到地形正常姿态', () => {
  const prone = getPose(crashState(0.45));
  const rising = getPose(crashState(0.225));
  const nearStanding = getPose(crashState(0.00001));
  const standing = getPose(crashState(0));
  assert.ok(rising.centerHeight > prone.centerHeight && rising.centerHeight < standing.centerHeight);
  assert.ok(rising.roll < prone.roll && rising.roll > standing.roll);
  assert.ok(Math.abs(nearStanding.roll - standing.roll) < 1e-6);
  assert.ok(Math.abs(nearStanding.centerHeight - standing.centerHeight) < 1e-6);
  close(standing.pitch, Math.atan(-0.18), '起身后的坡度');
  close(standing.roll, 0, '起身后的滚转');
});

test('更严重摔倒采用更长恢复计时，不会提前起身', () => {
  const mild = getPose(crashState(0.2, { recoveryTotal: 1.2, crashTier: 1 }));
  const severe = getPose(crashState(2.2, { recoveryTotal: 3.2, crashTier: 4 }));
  assert.ok(severe.centerHeight < mild.centerHeight);
  assert.ok(severe.roll > mild.roll);
});

test('企鹅骑乘抬升重心，菜单和摔倒阶段忽略骑乘高度', () => {
  const riding = getPose({ grounded: false, penguin: 4, rotation: 0.6, rollRotation: 1.2 });
  close(riding.centerHeight, 1.95, '骑乘高度');
  close(bodyCenter(riding).y, 1.95, '骑乘旋转后的重心');
  close(getPose({ grounded: true, penguin: 0 }).centerHeight, 1.1, '离开企鹅');
  const menu = getPose({ penguin: 4, recovering: 2 }, { menu: true });
  close(menu.pitch, -0.05, '菜单俯仰');
  close(menu.roll, 0, '菜单滚转');
  close(menu.centerHeight, 1.1, '菜单重心');
  close(getPose(crashState(1.3, { penguin: 4 })).centerHeight, 0.42, '摔倒高度');
});
