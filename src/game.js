import { sampleTerrain, clamp } from "./mountain-field.js";
import { environmentState } from "./world-weather.js";
import { EntityField, segmentHitsEntity } from "./spatial-entities.js";
import { AvalancheField } from "./avalanche-field.js";
import { TrickMechanics } from "./trick-mechanics.js";
export { sampleTerrain } from "./mountain-field.js";
export { terrainHeight, terrainSlope, terrainCurvature } from "./terrain.js";
const GRAVITY = 20;
export class SkiGame extends TrickMechanics {
  constructor({ seed = 20260905, startTime = "dawn", terrain } = {}) {
    super();
    this.terrainOverride = terrain;
    this.startTime = startTime;
    this.reset(seed, { startTime });
  }
  terrain(x, z) {
    return this.terrainOverride?.(x, z) || sampleTerrain(x, z, this.seed);
  }
  reset(seed = this.seed, options = {}) {
    this.seed = seed >>> 0;
    this.startTime = options.startTime || this.startTime || "dawn";
    const x = options.position?.x || 0,
      z = options.position?.z || 0,
      ground = this.terrain(x, z);
    this._events = [];
    this._bonusScore = 0;
    this._pitchTravel = 0;
    this._rollTravel = 0;
    this._comboRemaining = 0;
    this._jumpHeld = false;
    this._boostLocked = false;
    this._lastEntityTile = "";
    this.field = new EntityField(this.seed);
    this.avalancheField = new AvalancheField(this.seed, (x, z) =>
      this.terrain(x, z),
    );
    this.state = {
      phase: "menu",
      mode: "freeride",
      seed: this.seed,
      position: { x, y: ground.height, z },
      velocity: { x: 0, y: 0, z: -8 },
      heading: 0,
      distance: 0,
      descent: 0,
      speed: 8,
      x,
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
      groundSlope: -ground.gradient.z,
      groundNormal: ground.normal,
      slope: ground.slope,
      biome: ground.biome,
      region: ground.region.label,
      surface: ground.surface,
      takeoffType: "",
      landingImpact: 0,
      coins: 0,
      score: 0,
      flips: 0,
      combo: 0,
      bestCombo: 0,
      avalanche: 100,
      avalancheDistance: Infinity,
      avalancheEvents: [],
      burial: 0,
      energy: 100,
      shield: 0,
      magnet: 0,
      boostTime: 0,
      invincible: 0,
      elapsed: 0,
      reason: "",
      grounded: true,
      penguin: 0,
      boosting: false,
      crashes: 0,
      entities: [],
      environment: environmentState(this.seed, 0, x, z, this.startTime),
    };
    this._generate();
    return this.state;
  }
  start() {
    if (this.state.phase === "over") this.reset();
    if (this.state.phase === "menu") {
      this.state.phase = "playing";
      this._events.push({ type: "start", label: "旷野没有边界。" });
    }
  }
  pause() {
    if (this.state.phase === "playing") this.state.phase = "paused";
  }
  resume() {
    if (this.state.phase === "paused") this.state.phase = "playing";
  }
  drainEvents() {
    const events = this._events;
    this._events = [];
    return events;
  }
  update(delta, input = {}) {
    const s = this.state;
    if (s.phase !== "playing" || !Number.isFinite(delta) || delta <= 0) return;
    const dt = Math.min(delta, 0.05);
    s.elapsed += dt;
    for (const timer of [
      "shield",
      "magnet",
      "boostTime",
      "invincible",
      "penguin",
    ])
      s[timer] = Math.max(0, s[timer] - dt);
    if (s.recovering > 0) {
      s.recovering = Math.max(0, s.recovering - dt);
      if (!s.recovering) s.invincible = Math.max(s.invincible, 1.2);
    }
    this._comboRemaining = Math.max(0, this._comboRemaining - dt);
    if (!this._comboRemaining) s.combo = 0;
    if (!input.boost) this._boostLocked = false;
    const wasBoost = s.boosting;
    s.boosting = !!(
      !s.recovering &&
      input.boost &&
      s.energy > 0 &&
      !this._boostLocked
    );
    s.energy = clamp(s.energy + dt * (s.boosting ? -28 : 6), 0, 100);
    if (s.boosting && !wasBoost)
      this._events.push({ type: "boost", label: "疾速冲刺" });
    if (s.energy === 0) this._boostLocked = true;
    const jump = !!input.jump && !this._jumpHeld;
    this._jumpHeld = !!input.jump;
    if (jump && s.grounded && !s.recovering)
      this._launch(s.velocity.y + 9.4, "jump");
    const steps = Math.max(
      Math.ceil(dt / 0.008333),
      Math.ceil((s.speed * dt) / 0.65),
    );
    for (let i = 0; i < steps; i++) this._step(dt / steps, input);
    this._generate();
    const av = this.avalancheField.update(dt, s.elapsed, s.position);
    s.avalancheEvents = av.events;
    s.avalancheDistance = av.distance;
    s.avalanche = clamp(av.distance / 2, 0, 100);
    s.avalancheNearest = av.nearest;
    if (av.warned)
      this._events.push({
        type: "avalanche-warning",
        label: "山坡正在断裂 · 注意雷达方向",
      });
    if (av.contact && s.shield > 0) {
      s.shield = 0;
      s.invincible = 3;
      this._events.push({
        type: "powerup",
        kind: "protected",
        label: "护盾抵挡雪浪",
      });
    }
    const protection = s.invincible > 0 || s.penguin > 0;
    s.burial = clamp(
      s.burial +
        dt * (av.contact && !protection ? av.contact : 0) -
        dt * (!av.contact || protection ? 0.7 : 0),
      0,
      1.6,
    );
    if (s.burial >= 1.6) this.endRun("被雪崩卷入");
    s.score = Math.floor(s.distance + this._bonusScore);
    s.environment = environmentState(
      this.seed,
      s.elapsed,
      s.position.x,
      s.position.z,
      this.startTime,
    );
  }
  _step(dt, input) {
    const s = this.state,
      p = s.position,
      v = s.velocity,
      previous = { ...p },
      ground = this.terrain(p.x, p.z),
      g = ground.gradient;
    const steer = s.recovering ? 0 : clamp(Number(input.steer) || 0, -1, 1);
    s.heading +=
      steer * dt * (s.grounded ? 1.45 / (1 + s.speed * 0.018) : 0.32);
    s.heading = Math.atan2(Math.sin(s.heading), Math.cos(s.heading));
    const fx = Math.sin(s.heading),
      fz = -Math.cos(s.heading),
      rx = Math.cos(s.heading),
      rz = Math.sin(s.heading);
    if (s.grounded) {
      const denom = 1 + g.x * g.x + g.z * g.z;
      v.x -= ((GRAVITY * g.x) / denom) * dt;
      v.z -= ((GRAVITY * g.z) / denom) * dt;
      const ice = ground.surface === "ice",
        grip = ice ? 1.1 : 6,
        lateral = v.x * rx + v.z * rz,
        correction = 1 - Math.exp(-dt * grip);
      v.x -= rx * lateral * correction;
      v.z -= rz * lateral * correction;
      const brake = s.recovering ? 1 : clamp(Number(input.brake) || 0, 0, 1),
        tuck = Number(input.tuck) || 0;
      const drag =
        (ice ? 0.025 : ground.surface === "powder" ? 0.115 : 0.07) +
        (tuck ? 0 : 0.025) +
        brake * 3.5 +
        s.speed * 0.0018;
      const damping = Math.exp(-drag * dt);
      v.x *= damping;
      v.z *= damping;
      const alongSlope = g.x * fx + g.z * fz;
      const push =
        (!s.recovering && tuck && s.speed < 5 && alongSlope < 0.22 ? 6 : 0) +
        (s.boosting && alongSlope < 0.28 ? 7 : 0) +
        (s.penguin > 0 ? 1.5 : 0);
      v.x += fx * push * dt;
      v.z += fz * push * dt;
      if (brake > 0.5 && Math.hypot(v.x, v.z) < 0.4) {
        v.x = 0;
        v.z = 0;
      }
      const limit = 55,
        sp = Math.hypot(v.x, v.z);
      if (sp > limit) {
        v.x *= limit / sp;
        v.z *= limit / sp;
      }
      v.y = g.x * v.x + g.z * v.z;
      const probe = this.terrain(p.x + v.x * dt, p.z + v.z * dt),
        nextVy = probe.gradient.x * v.x + probe.gradient.z * v.z;
      if (!s.recovering && s.speed > 7 && (nextVy - v.y) / dt < -GRAVITY * 1.08)
        this._launch(v.y + 1.8, "terrain");
    } else {
      s.airTime += dt;
      this._rotate(dt, input);
    }
    p.x += v.x * dt;
    p.z += v.z * dt;
    const next = this.terrain(p.x, p.z);
    if (s.grounded) p.y = next.height;
    else {
      p.y += v.y * dt - 0.5 * GRAVITY * dt * dt;
      v.y -= GRAVITY * dt;
      s.y = p.y - next.height;
      s.airHeightPeak = Math.max(s.airHeightPeak, s.y);
      if (p.y <= next.height) {
        s.groundSlope = next.gradient.x * fx + next.gradient.z * fz;
        s.landingImpact = Math.max(
          0,
          next.gradient.x * v.x + next.gradient.z * v.z - v.y,
        );
        p.y = next.height;
        this._land();
        v.y = next.gradient.x * v.x + next.gradient.z * v.z;
      }
    }
    s.distance += Math.hypot(p.x - previous.x, p.z - previous.z);
    s.descent += Math.max(0, previous.y - p.y);
    s.x = p.x;
    s.y = Math.max(0, p.y - next.height);
    s.vy = v.y;
    s.speed = Math.hypot(v.x, v.z);
    s.groundSlope = next.gradient.x * fx + next.gradient.z * fz;
    s.groundNormal = next.normal;
    s.slope = next.slope;
    s.biome = next.biome;
    s.region = next.region.label;
    s.surface = next.surface;
    for (const e of this._testEntities ||
      this.field.query(p.x, p.z, Math.max(9, s.speed * dt + 6)))
      this._interact(e, previous);
  }
  _launch(velocity, type) {
    const s = this.state;
    if (s.recovering || !s.grounded) return;
    s.velocity.y = velocity;
    s.vy = velocity;
    s.grounded = false;
    s.rotation = 0;
    s.rollRotation = 0;
    s.pitchTurns = 0;
    s.rollTurns = 0;
    s.airTurns = 0;
    s.airScore = 0;
    s.airTime = 0;
    s.airHeightPeak = 0;
    s.takeoffType = type;
    this._pitchTravel = 0;
    this._rollTravel = 0;
    this._events.push({
      type,
      label: type === "terrain" ? "冲出天然坡唇" : "起跳",
    });
  }
  _crash(kind) {
    const before = this.state.crashes;
    super._crash(kind);
    if (this.state.crashes !== before) {
      const s = this.state;
      s.velocity.x *= 0.15;
      s.velocity.z *= 0.15;
      s.velocity.y = 0;
      s.position.y = this.terrain(s.position.x, s.position.z).height;
    }
  }
  _interact(e, previous) {
    const s = this.state;
    if (e.collected || s.recovering) return;
    const magnet = e.type === "coin" && s.magnet > 0;
    if (!segmentHitsEntity(previous, s.position, e, magnet ? 5 : 0.4)) return;
    if (e.type === "coin") {
      this.field.collect(e);
      s.coins++;
      this._bonusScore += 25;
      s.energy = Math.min(100, s.energy + 2);
      this._events.push({ type: "coin", value: 1 });
    } else if (["shield", "magnet", "penguin"].includes(e.type)) {
      this.field.collect(e);
      s[e.type] = e.type === "penguin" ? 8 : 12;
      this._events.push({
        type: "powerup",
        kind: e.type,
        label: { shield: "雪晶护盾", magnet: "金币磁铁", penguin: "企鹅伙伴" }[
          e.type
        ],
      });
    } else if (e.type === "ramp") {
      if (s.grounded) this._launch(s.velocity.y + 13, "ramp");
    } else this._crash(e.type);
  }
  _generate() {
    const s = this.state,
      key = `${Math.floor(s.position.x / 32)}:${Math.floor(s.position.z / 32)}`;
    if (key !== this._lastEntityTile) {
      this._lastEntityTile = key;
      s.entities = this.field.update(s.position.x, s.position.z);
    } else s.entities = s.entities.filter((e) => !e.collected);
  }
  endRun(reason) {
    if (this.state.phase === "over") return;
    this.state.phase = "over";
    this.state.reason = reason;
    this.state.boosting = false;
    this._events.push({
      type: "gameover",
      label: reason,
      value: this.state.score,
    });
  }
}
