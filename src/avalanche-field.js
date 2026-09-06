import { sampleTerrain, mountainHeight, hash2 } from "./mountain-field.js";
export class AvalancheField {
  constructor(seed, sampler = (x, z) => sampleTerrain(x, z, seed)) {
    this.seed = seed;
    this.sample = sampler;
    this.events = [];
    this.nextEvent = 18;
    this.serial = 0;
    this.accumulator = 0;
  }
  spawn(position, elapsed) {
    const s = this.sample(position.x, position.z),
      g = s.gradient,
      len = Math.hypot(g.x, g.z) || 1;
    const direction = { x: g.x / len, z: g.z / len };
    const distance = 180 + hash2(this.serial, 1, this.seed) * 80;
    const x = position.x + direction.x * distance,
      z = position.z + direction.z * distance;
    if (this.sample(x, z).height < s.height + 12) return false;
    const event = {
      id: this.serial++,
      x,
      z,
      warningUntil: elapsed + 10,
      born: elapsed,
      cells: [],
      active: false,
    };
    for (let i = -4; i <= 4; i++) {
      const px = x - direction.z * i * 12,
        pz = z + direction.x * i * 12;
      event.cells.push({
        x: px,
        z: pz,
        y: this.sample(px, pz).height,
        vx: 0,
        vz: 0,
        radius: 10,
        stopped: false,
      });
    }
    this.events.push(event);
    return true;
  }
  update(dt, elapsed, position) {
    let warned = false;
    if (elapsed >= this.nextEvent) {
      warned = this.spawn(position, elapsed);
      this.nextEvent =
        elapsed + (warned ? Math.max(34, 78 - elapsed * 0.04) : 10);
    }
    this.accumulator += dt;
    while (this.accumulator >= 0.1) {
      this.accumulator -= 0.1;
      for (const event of this.events) {
        if (elapsed < event.warningUntil) continue;
        event.active = true;
        for (const c of event.cells) {
          if (c.stopped) continue;
          const sample = this.sample(c.x, c.z),
            g = sample.gradient,
            len = Math.hypot(g.x, g.z);
          if (len < 0.035) {
            c.vx *= 0.94;
            c.vz *= 0.94;
          } else {
            const speed = Math.min(36, 10 + len * 27);
            c.vx += ((-g.x / len) * speed - c.vx) * 0.22;
            c.vz += ((-g.z / len) * speed - c.vz) * 0.22;
          }
          const nx = c.x + c.vx * 0.1,
            nz = c.z + c.vz * 0.1,
            h = this.sample(nx, nz).height;
          // Flow cannot gain potential height by crossing a ridge.
          if (h > c.y + 0.12) {
            c.vx *= 0.4;
            c.vz *= 0.4;
            if (Math.hypot(c.vx, c.vz) < 0.8) c.stopped = true;
          } else {
            c.x = nx;
            c.z = nz;
            c.y = h;
            c.radius = Math.min(27, c.radius + 0.026);
          }
        }
      }
    }
    this.events = this.events.filter((e) => elapsed - e.born < 145).slice(-4);
    let distance = Infinity,
      nearest = null,
      contact = 0;
    for (const e of this.events)
      for (const c of e.cells) {
        const d = Math.hypot(c.x - position.x, c.z - position.z) - c.radius;
        if (d < distance) {
          distance = d;
          nearest = e;
        }
        if (e.active && d < 0 && position.y < c.y + 9)
          contact = Math.max(contact, Math.min(1, -d / 6));
      }
    return {
      distance: Math.max(0, distance),
      nearest,
      contact,
      warned,
      events: this.events,
    };
  }
}
