import { terrainHeight, terrainSlope, terrainCurvature } from './terrain.js';

export { terrainHeight, terrainSlope, terrainCurvature } from './terrain.js';

const TAU = Math.PI * 2;
const GRAVITY = 20;
const LANES = [-6, -3, 0, 3, 6];
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const controlAxis = value => value === true ? 1 : Number.isFinite(value) ? clamp(value, -1, 1) : 0;

export class SkiGame {
  constructor({ seed = 20260905 } = {}) {
    this.seed = seed;
    this.reset(seed);
  }

  reset(seed = this.seed) {
    this.seed = seed;
    this._randomState = Number(seed) >>> 0;
    this._routeRandomState = (Number(seed) ^ 0x9e3779b9) >>> 0;
    this._routeLanes = [2];
    this._nextRow = 40;
    this._nextObstacle = 160;
    this._nextPowerup = 260;
    this._nextRamp = 146;
    this._powerupIndex = 0;
    this._rowIndex = 0;
    this._safeLane = 2;
    this._entityId = 0;
    this._events = [];
    this._horizontalVelocity = 0;
    this._bonusScore = 0;
    this._pitchTravel = 0;
    this._rollTravel = 0;
    this._comboRemaining = 0;
    this._jumpHeld = false;
    this._boostLocked = false;
    this.state = {
      phase: 'menu',
      distance: 0,
      speed: 18,
      x: 0,
      y: 0,
      vy: 0,
      rotation: 0,
      rollRotation: 0,
      pitchTurns: 0,
      rollTurns: 0,
      airTurns: 0,
      airScore: 0,
      airHeightPeak: 0,
      airTime: 0,
      recovering: 0,
      recoveryTotal: 0,
      crashTier: 0,
      crashHeight: 0,
      groundSlope: terrainSlope(0),
      takeoffType: '',
      landingImpact: 0,
      coins: 0,
      score: 0,
      flips: 0,
      combo: 0,
      bestCombo: 0,
      avalanche: 80,
      energy: 100,
      shield: 0,
      magnet: 0,
      boostTime: 0,
      invincible: 0,
      elapsed: 0,
      reason: '',
      grounded: true,
      penguin: 0,
      boosting: false,
      crashes: 0,
      entities: [],
    };
    this._generate();
    return this.state;
  }

  start() {
    if (this.state.phase === 'over') this.reset();
    if (this.state.phase === 'menu') {
      this.state.phase = 'playing';
      this._events.push({ type: 'start', label: '雪山，出发！' });
    }
  }

  pause() {
    if (this.state.phase === 'playing') this.state.phase = 'paused';
  }

  resume() {
    if (this.state.phase === 'paused') this.state.phase = 'playing';
  }

  drainEvents() {
    const events = this._events;
    this._events = [];
    return events;
  }

  update(delta, input = {}) {
    if (this.state.phase !== 'playing' || !Number.isFinite(delta) || delta <= 0) return;
    // 限制恢复后台后的帧长，碰撞仍检查整帧经过的路径。
    const dt = Math.min(delta, 0.05);
    const state = this.state;
    const previous = { d: state.distance, x: state.x, y: state.y };
    state.elapsed += dt;
    for (const timer of ['shield', 'magnet', 'boostTime', 'invincible', 'penguin']) {
      state[timer] = Math.max(0, state[timer] - dt);
    }
    const wasRecovering = state.recovering > 0;
    if (wasRecovering) {
      state.recovering = Math.max(0, state.recovering - dt);
      if (state.recovering === 0) state.invincible = Math.max(state.invincible, 1.2);
    }
    this._comboRemaining = Math.max(0, this._comboRemaining - dt);
    if (this._comboRemaining === 0) state.combo = 0;

    const wasBoosting = state.boosting;
    if (!input.boost) this._boostLocked = false;
    state.boosting = Boolean(!wasRecovering && input.boost && state.energy > 0 && !this._boostLocked);
    if (state.boosting) {
      state.energy = Math.max(0, state.energy - dt * 28);
      state.avalanche += dt * 3.2;
      if (!wasBoosting) this._events.push({ type: 'boost', label: '疾速冲刺' });
      if (state.energy === 0) this._boostLocked = true;
    } else {
      state.energy = Math.min(100, state.energy + dt * 6);
    }

    const slopeSpeed = clamp(-terrainSlope(previous.d) * 5.5, -3, 8);
    const targetSpeed = 18 + Math.min(12, state.distance * 0.004) + slopeSpeed
      + (state.boosting ? 10 : 0) + (state.boostTime > 0 ? 5 : 0) + (state.penguin > 0 ? 6 : 0);
    if (wasRecovering) state.speed = 6;
    else state.speed += (targetSpeed - state.speed) * (1 - Math.exp(-dt * 1.15));
    state.distance += state.speed * dt;
    const steer = wasRecovering ? 0 : controlAxis(input.steer);
    if (wasRecovering) this._horizontalVelocity = 0;
    else this._horizontalVelocity += (steer * 10.5 - this._horizontalVelocity) * (1 - Math.exp(-dt * 13));
    state.x = clamp(state.x + this._horizontalVelocity * dt, -8, 8);

    const jumpPressed = Boolean(input.jump && !this._jumpHeld);
    this._jumpHeld = Boolean(input.jump);
    state.groundSlope = terrainSlope(previous.d);
    if (jumpPressed && state.grounded && !wasRecovering) this._launch(state.groundSlope * state.speed + 9.4, 'jump');
    this._travel(dt, previous.d, input, wasRecovering);

    for (const entity of state.entities) this._interact(entity, previous);
    // 追赶速度逐渐提高，连续收集和完成技巧能够延长生存时间。
    state.avalanche -= dt * (0.72 + Math.min(1.45, state.elapsed * 0.006));
    if (wasRecovering || state.recovering > 0) state.avalanche -= dt * 8;
    state.avalanche = clamp(state.avalanche, 0, 100);
    state.score = Math.floor(state.distance + this._bonusScore);
    state.entities = state.entities.filter(entity => entity.d > state.distance - 24);
    this._generate();
    if (state.avalanche <= 0) {
      state.phase = 'over';
      state.reason = '雪崩追上了你';
      state.boosting = false;
      this._events.push({ type: 'gameover', label: state.reason, value: state.score });
    }
  }

  _launch(velocity, type) {
    const state = this.state;
    if (state.recovering > 0 || !state.grounded) return;
    state.vy = velocity;
    state.grounded = false;
    state.rotation = 0;
    state.rollRotation = 0;
    state.pitchTurns = 0;
    state.rollTurns = 0;
    state.airTurns = 0;
    state.airScore = 0;
    state.airHeightPeak = 0;
    state.airTime = 0;
    state.takeoffType = type;
    this._pitchTravel = 0;
    this._rollTravel = 0;
    const labels = { ramp: '飞跃跳台！', terrain: '冲出坡顶！', jump: '起跳' };
    this._events.push({ type, label: labels[type] });
  }

  _travel(dt, startDistance, input, recovering) {
    const state = this.state;
    const endDistance = state.distance;
    const steps = Math.max(1, Math.ceil((endDistance - startDistance) / 0.75), Math.ceil(dt / 0.012));
    const step = dt / steps;
    let distance = startDistance;
    let worldHeight = terrainHeight(distance) + state.y;
    for (let index = 0; index < steps; index += 1) {
      const nextDistance = startDistance + (endDistance - startDistance) * (index + 1) / steps;
      const ground = terrainHeight(nextDistance);
      const slope = terrainSlope(distance);
      if (recovering || state.recovering > 0) {
        state.y = 0;
        state.grounded = true;
        state.vy = terrainSlope(nextDistance) * state.speed;
        worldHeight = ground;
      } else {
        // 坡面向下弯曲所需加速度大于重力时，雪板自然脱离坡面。
        if (state.grounded && terrainCurvature(distance) * state.speed ** 2 < -GRAVITY * 1.02) {
          // 坡唇的弹性给相切起飞补充向上助力，保留陡降带来的长滞空。
          this._launch(slope * state.speed + 17, 'terrain');
        }
        if (state.grounded) {
          worldHeight = ground;
          state.y = 0;
          state.vy = terrainSlope(nextDistance) * state.speed;
        } else {
          state.airTime += step;
          this._rotate(step, input);
          // 始终推进世界坐标中的弹道，下落地形不会把玩家一并拖低。
          worldHeight += state.vy * step - 0.5 * GRAVITY * step ** 2;
          state.vy -= GRAVITY * step;
          state.y = worldHeight - ground;
          state.airHeightPeak = Math.max(state.airHeightPeak, state.y);
          if (state.y <= 0) {
            state.groundSlope = terrainSlope(nextDistance);
            state.landingImpact = Math.max(0, state.groundSlope * state.speed - state.vy);
            this._land();
            worldHeight = ground;
          }
        }
      }
      distance = nextDistance;
    }
    state.groundSlope = terrainSlope(endDistance);
  }

  _rotate(dt, input) {
    const state = this.state;
    for (const [field, travel, turns, amount, rate] of [
      ['rotation', '_pitchTravel', 'pitchTurns', controlAxis(input.flip), 9.8],
      ['rollRotation', '_rollTravel', 'rollTurns', controlAxis(input.roll), 10.8],
    ]) {
      if (amount !== 0) {
        const delta = amount * rate * dt;
        state[field] += delta;
        // 只记录手动净旋转的最大完整圈数，反向摆动和自动回正不刷分。
        this[travel] += delta;
        state[turns] = Math.max(state[turns], Math.floor((Math.abs(this[travel]) + 1e-8) / TAU));
      } else {
        const target = Math.round(state[field] / TAU) * TAU;
        state[field] += (target - state[field]) * (1 - Math.exp(-dt * 9));
      }
    }
    state.airTurns = state.pitchTurns + state.rollTurns;
    const mixed = state.pitchTurns > 0 && state.rollTurns > 0 ? 1.25 : 1;
    state.airScore = Math.round(75 * state.airTurns * (state.airTurns + 1) * mixed);
  }

  _land() {
    const state = this.state;
    const angle = value => Math.abs(Math.atan2(Math.sin(value), Math.cos(value)));
    state.y = 0;
    state.vy = state.groundSlope * state.speed;
    state.grounded = true;
    if (angle(state.rotation) > 0.72 || angle(state.rollRotation) > 0.72) {
      this._crash('landing');
    } else if (state.airTurns > 0) {
      state.flips += state.airTurns;
      state.combo += state.airTurns;
      state.bestCombo = Math.max(state.bestCombo, state.combo);
      this._comboRemaining = 9;
      const reward = state.airScore;
      this._bonusScore += reward;
      state.energy = Math.min(100, state.energy + Math.min(20, state.airTurns * 5));
      state.avalanche = Math.min(100, state.avalanche + Math.min(7, state.airTurns * 1.8));
      state.boostTime = Math.max(state.boostTime, 0.6);
      const mixed = state.pitchTurns > 0 && state.rollTurns > 0;
      this._events.push({
        type: 'flip', label: `${state.airTurns} 圈${mixed ? '混合技巧' : state.rollTurns ? '侧翻' : '空翻'}！`,
        value: reward, turns: state.airTurns, pitchTurns: state.pitchTurns, rollTurns: state.rollTurns,
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
    if (kind !== 'landing' && (state.invincible > 0 || state.penguin > 0)) return;
    if (kind !== 'landing' && state.shield > 0) {
      state.shield = 0;
      state.invincible = 1.4;
      this._events.push({ type: 'powerup', kind: 'protected', label: '护盾保护' });
      return;
    }
    const height = kind === 'landing' ? state.airHeightPeak : 0;
    const tier = height < 4 ? 1 : height < 10 ? 2 : height < 20 ? 3 : 4;
    const duration = [1, 1.8, 2.8, 4][tier - 1];
    const penalty = [5, 9, 14, 20][tier - 1];
    state.crashes += 1;
    state.speed = 6;
    state.avalanche = Math.max(0, state.avalanche - penalty);
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
      type: 'crash', kind, tier, height, duration, value: -penalty,
      label: kind === 'landing' ? `${Math.round(height)} 米落地失误 · 趴地 ${duration} 秒` : '撞上障碍 · 趴地 1 秒',
    });
  }

  _interact(entity, previous) {
    const state = this.state;
    if (state.recovering > 0) return;
    if (entity.collected || entity.d < previous.d - 0.8 || entity.d > state.distance + 0.8) return;
    const progress = clamp((entity.d - previous.d) / Math.max(0.001, state.distance - previous.d), 0, 1);
    const crossingX = previous.x + (state.x - previous.x) * progress;
    const crossingY = previous.y + (state.y - previous.y) * progress;
    const gap = Math.abs(crossingX - entity.x);
    if (entity.type === 'coin') {
      const magnet = state.magnet > 0;
      if (gap > (magnet ? 5 : 1.05) || crossingY > (magnet ? 7 : 2.6)) return;
      entity.collected = true;
      state.coins += 1;
      this._bonusScore += 25;
      state.energy = Math.min(100, state.energy + 2);
      state.avalanche = Math.min(100, state.avalanche + 0.35);
      this._events.push({ type: 'coin', value: 1 });
      return;
    }
    if (entity.type === 'ramp') {
      if (gap < 1.45 && crossingY < 0.7 && state.grounded) {
        entity.collected = true;
        this._launch(state.groundSlope * state.speed + 13, 'ramp');
      }
      return;
    }
    if (['shield', 'magnet', 'penguin'].includes(entity.type)) {
      if (gap > 1.3 || crossingY > 2.5) return;
      entity.collected = true;
      const labels = { shield: '雪晶护盾', magnet: '金币磁铁', penguin: '企鹅伙伴 · 一起冲！' };
      state[entity.type] = entity.type === 'penguin' ? 8 : 12;
      this._events.push({ type: 'powerup', kind: entity.type, label: labels[entity.type] });
      return;
    }
    const width = entity.type === 'log' ? 1.6 : entity.type === 'tree' ? 1.05 : 1.15;
    const height = entity.type === 'tree' ? 6.8 : entity.type === 'log' ? 0.85 : 1.15;
    if (gap < width && crossingY < height) {
      entity.collected = true;
      this._crash(entity.type);
    }
  }

  _random() {
    this._randomState = (Math.imul(this._randomState, 1664525) + 1013904223) >>> 0;
    return this._randomState / 4294967296;
  }

  _add(type, x, d) {
    this.state.entities.push({ id: `snow-${this._entityId++}`, type, x, d, collected: false });
  }

  _routeLane(distance) {
    const section = Math.max(0, Math.floor((distance - 40) / 66));
    // 路线拥有独立随机序列，逐帧生成和一次生成得到同一条路线。
    while (this._routeLanes.length <= section) {
      this._routeRandomState = (Math.imul(this._routeRandomState, 1664525) + 1013904223) >>> 0;
      const offset = Math.floor(this._routeRandomState / 4294967296 * 3) - 1;
      this._routeLanes.push(clamp(this._routeLanes.at(-1) + offset, 0, LANES.length - 1));
    }
    return this._routeLanes[section];
  }

  _generate() {
    // 金币约六十枚每公里，顺着逐步移动的安全路线引导玩家。
    while (this._nextRow < this.state.distance + 220) {
      const distance = this._nextRow;
      this._safeLane = this._routeLane(distance);
      const safeX = LANES[this._safeLane];
      for (let coin = 0; coin < 4; coin += 1) this._add('coin', safeX, distance + coin * 3.4);
      this._nextRow += 66;
      this._rowIndex += 1;
    }
    while (this._nextObstacle < this.state.distance + 220) {
      const distance = this._nextObstacle;
      // 每排只占两道，坡顶和着陆区域都保留中道与至少两条通路。
      const nearDrop = terrainCurvature(distance) < -0.018 || terrainSlope(distance) < -0.65;
      const safeLane = this._routeLane(distance);
      const available = LANES.filter((_, lane) => lane !== safeLane && (!nearDrop || lane !== 2));
      for (let obstacle = 0; obstacle < 2; obstacle += 1) {
        const choice = Math.floor(this._random() * available.length);
        const x = available.splice(choice, 1)[0];
        const types = ['rock', 'tree', 'log'];
        this._add(types[Math.floor(this._random() * types.length)], x, distance);
      }
      this._nextObstacle += 72;
    }
    while (this._nextPowerup < this.state.distance + 220) {
      this._add(['shield', 'magnet', 'penguin'][this._powerupIndex % 3], LANES[this._routeLane(this._nextPowerup)], this._nextPowerup);
      this._nextPowerup += 360;
      this._powerupIndex += 1;
    }
    while (this._nextRamp < this.state.distance + 220) {
      this._add('ramp', LANES[this._routeLane(this._nextRamp)], this._nextRamp);
      this._nextRamp += 720;
    }
  }
}
