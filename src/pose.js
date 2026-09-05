const BODY_CENTER = 1.1;
const LYING_CENTER = 0.42;
const RISE_DURATION = 0.45;

const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function getSkierPose(state = {}, { menu = false, steer = 0, time = 0 } = {}) {
  state ??= {};
  const slopePitch = Math.atan(finite(state.groundSlope));
  const steering = finite(steer);
  const grounded = state.grounded !== false;
  let pitch = grounded ? slopePitch : finite(state.rotation);
  let roll = grounded ? -steering * 0.22 : -finite(state.rollRotation) - steering * 0.06;
  let centerHeight = BODY_CENTER + (finite(state.penguin) > 0 ? 0.85 : 0);

  if (menu) {
    pitch = -0.05;
    roll = 0;
    centerHeight = BODY_CENTER;
  } else if (finite(state.recovering) > 0) {
    const remaining = state.recovering;
    const elapsed = Math.max(0, finite(state.recoveryTotal, remaining) - remaining);
    const tier = clamp(finite(state.crashTier, 1), 1, 4);

    // 摔倒前半秒保留少量碰撞摇摆，静止后直到最后阶段才起身。
    // 只使用物理恢复计时，暂停期间不受渲染时钟影响。
    const settle = Math.max(0, 1 - elapsed / 0.5) ** 2;
    const wobble = Math.sin(elapsed * 23) * settle * (0.1 + tier * 0.015);
    const riseProgress = clamp(1 - remaining / RISE_DURATION, 0, 1);
    const rise = riseProgress * riseProgress * (3 - 2 * riseProgress);
    const lyingPitch = slopePitch + 0.18 + Math.sin(elapsed * 19) * settle * 0.06;
    const lyingRoll = 1.45 + wobble;
    pitch = lyingPitch + (slopePitch - lyingPitch) * rise;
    roll = lyingRoll + (-steering * 0.22 - lyingRoll) * rise;
    centerHeight = LYING_CENTER + (BODY_CENTER - LYING_CENTER) * rise;
  }

  // Three.js 的 XYZ 欧拉角将重心先绕 Z、再绕 X 旋转。
  // 用反向位移抵消旋转后的重心偏移，让翻转围绕身体而非雪板原点。
  const rotatedCenterY = BODY_CENTER * Math.cos(pitch) * Math.cos(roll);
  return {
    pitch,
    roll,
    offsetX: BODY_CENTER * Math.sin(roll),
    offsetY: centerHeight - rotatedCenterY,
    offsetZ: -BODY_CENTER * Math.sin(pitch) * Math.cos(roll),
    centerHeight,
  };
}
