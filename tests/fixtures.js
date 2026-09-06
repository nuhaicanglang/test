import { SkiGame } from "../src/game.js";
export function plane(x, z, slope = 0.3, surface = "snow") {
  const len = Math.hypot(1, slope);
  return {
    height: z * slope,
    gradient: { x: 0, z: slope },
    normal: { x: 0, y: 1 / len, z: -slope / len },
    slope: (Math.atan(slope) * 180) / Math.PI,
    region: { label: "测试坡面", id: "powder" },
    biome: "powder",
    surface,
  };
}
export function fresh(slope = 0.3, surface = "snow") {
  const g = new SkiGame({
    seed: 7,
    terrain: (x, z) => plane(x, z, slope, surface),
  });
  g.start();
  g._testEntities = [];
  g.avalancheField.nextEvent = 100000;
  g.drainEvents();
  return g;
}
export function advance(g, seconds, input = {}) {
  for (let i = 0; i < Math.round(seconds * 120); i++) g.update(1 / 120, input);
}
export function airborne(height = 90) {
  const g = fresh(0);
  g.state.position.y = height;
  g.state.y = height;
  g.state.velocity = { x: 0, y: 0, z: 0 };
  g.state.grounded = false;
  return g;
}
export function landNext(g, vy = -80) {
  g.state.position.y =
    g.terrain(g.state.position.x, g.state.position.z).height + 0.005;
  g.state.velocity.y = vy;
  g.state.y = 0.005;
  g.state.vy = vy;
}
export function entity(type, x = 0, z = -2) {
  return {
    id: type,
    type,
    x,
    z,
    y: 0,
    radius: { log: 1.6, rock: 1.15, tree: 0.7 }[type] || 1,
    height: { log: 0.85, rock: 1.8, tree: 7 }[type] || 2,
    collected: false,
  };
}
