export function buildInput({ keys = new Set(), touches = new Set(), jumpQueued = false, heldMilliseconds = 0 } = {}) {
  const left = keys.has('ArrowLeft') || keys.has('KeyA') || touches.has('left');
  const right = keys.has('ArrowRight') || keys.has('KeyD') || touches.has('right');
  const front = keys.has('KeyW') || keys.has('ArrowDown') || touches.has('frontflip');
  const back = keys.has('KeyS') || keys.has('KeyF') || touches.has('backflip');
  const jumpHeld = keys.has('Space') || keys.has('ArrowUp') || touches.has('jump');
  const rollLeft = keys.has('KeyQ') || touches.has('roll-left');
  const rollRight = keys.has('KeyE') || touches.has('roll-right');
  // 显式方向键优先于长按跳跃，允许在空中组合两条旋转轴。
  const flip = front || back ? Number(back) - Number(front) : Number(jumpHeld && heldMilliseconds > 70);
  return {
    steer: Number(right) - Number(left),
    jump: Boolean(jumpQueued),
    flip,
    roll: Number(rollRight) - Number(rollLeft),
    boost: keys.has('ShiftLeft') || keys.has('ShiftRight') || touches.has('boost'),
  };
}
