const TAU = Math.PI * 2;
const controlAxis = (value) =>
  value === true
    ? 1
    : Number.isFinite(value)
      ? Math.max(-1, Math.min(1, value))
      : 0;
// Trick rotation, rewards and recovery remain independent of world streaming.
export class TrickMechanics {
  _rotate(dt, input) {
    const state = this.state;
    for (const [field, travel, turns, amount, rate] of [
      ["rotation", "_pitchTravel", "pitchTurns", controlAxis(input.flip), 9.8],
      [
        "rollRotation",
        "_rollTravel",
        "rollTurns",
        controlAxis(input.roll),
        10.8,
      ],
    ]) {
      if (amount !== 0) {
        const delta = amount * rate * dt;
        state[field] += delta;
        // 只记录手动净旋转的最大完整圈数，反向摆动和自动回正不刷分。
        this[travel] += delta;
        state[turns] = Math.max(
          state[turns],
          Math.floor((Math.abs(this[travel]) + 1e-8) / TAU),
        );
      } else {
        const target = Math.round(state[field] / TAU) * TAU;
        state[field] += (target - state[field]) * (1 - Math.exp(-dt * 9));
      }
    }
    state.airTurns = state.pitchTurns + state.rollTurns;
    const mixed = state.pitchTurns > 0 && state.rollTurns > 0 ? 1.25 : 1;
    state.airScore = Math.round(
      75 * state.airTurns * (state.airTurns + 1) * mixed,
    );
  }

  _land() {
    const state = this.state;
    const angle = (value) =>
      Math.abs(Math.atan2(Math.sin(value), Math.cos(value)));
    state.y = 0;
    state.vy = state.groundSlope * state.speed;
    state.grounded = true;
    if (angle(state.rotation) > 0.72 || angle(state.rollRotation) > 0.72) {
      this._crash("landing");
    } else if (state.airTurns > 0) {
      state.flips += state.airTurns;
      state.combo += state.airTurns;
      state.bestCombo = Math.max(state.bestCombo, state.combo);
      this._comboRemaining = 9;
      const reward = state.airScore;
      this._bonusScore += reward;
      state.energy = Math.min(
        100,
        state.energy + Math.min(20, state.airTurns * 5),
      );
      state.boostTime = Math.max(state.boostTime, 0.6);
      const mixed = state.pitchTurns > 0 && state.rollTurns > 0;
      this._events.push({
        type: "flip",
        label: `${state.airTurns} 圈${mixed ? "混合技巧" : state.rollTurns ? "侧翻" : "空翻"}！`,
        value: reward,
        turns: state.airTurns,
        pitchTurns: state.pitchTurns,
        rollTurns: state.rollTurns,
      });
    }
    state.rotation = 0;
    state.rollRotation = 0;
    state.pitchTurns = 0;
    state.rollTurns = 0;
    state.airTurns = 0;
    state.airScore = 0;
    this._pitchTravel = 0;
    this._rollTravel = 0;
  }

  _crash(kind) {
    const state = this.state;
    if (state.recovering > 0) return;
    if (kind !== "landing" && (state.invincible > 0 || state.penguin > 0))
      return;
    if (kind !== "landing" && state.shield > 0) {
      state.shield = 0;
      state.invincible = 1.4;
      this._events.push({
        type: "powerup",
        kind: "protected",
        label: "护盾保护",
      });
      return;
    }
    const height = kind === "landing" ? state.airHeightPeak : 0;
    const tier = height < 4 ? 1 : height < 10 ? 2 : height < 20 ? 3 : 4;
    const duration = [1, 1.8, 2.8, 4][tier - 1];
    const penalty = [5, 9, 14, 20][tier - 1];
    state.crashes += 1;
    state.speed = 6;
    state.invincible = 0;
    state.recovering = duration;
    state.recoveryTotal = duration;
    state.crashTier = tier;
    state.crashHeight = height;
    state.combo = 0;
    state.airScore = 0;
    state.airTurns = 0;
    state.pitchTurns = 0;
    state.rollTurns = 0;
    state.boostTime = 0;
    state.boosting = false;
    state.y = 0;
    state.grounded = true;
    state.rotation = 0;
    state.rollRotation = 0;
    this._horizontalVelocity = 0;
    this._comboRemaining = 0;
    this._events.push({
      type: "crash",
      kind,
      tier,
      height,
      duration,
      value: -penalty,
      label:
        kind === "landing"
          ? `${Math.round(height)} 米落地失误 · 趴地 ${duration} 秒`
          : "撞上障碍 · 趴地 1 秒",
    });
  }
}
