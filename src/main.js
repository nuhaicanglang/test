import "./style.css";
import "./alpine.css";
import "./freeride.css";
import { normalizeQuality } from "./quality.js";
import { SkiGame } from "./game.js";
import { SkiWorld } from "./world.js";
import { GameUI } from "./ui.js";
import { GameAudio } from "./audio.js";
import { readSave, writeSave, bankRun, canUseSkin } from "./save.js";
import { buildInput } from "./input.js";

let save = readSave();
const game = new SkiGame({ startTime: save.startTime });
const audio = new GameAudio(save.sound);
const keys = new Set();
const touches = new Set();
let jumpQueued = false;
let jumpStarted = 0;
let banked = true;
let world;
let joystick = { x: 0, y: 0 };
let observing = false;
let accumulator = 0;
let lastAirTurns = 0;
const missionComplete = new Set();

const ui = new GameUI({
  onStart: start,
  onRestart: () => start(true),
  onJoystick: (value) => {
    joystick = value;
  },
  onStartTime: (value) => {
    save.startTime = value;
    persist();
    if (game.state.phase === "menu") {
      game.reset(game.seed, { startTime: value });
      world.snapCamera = true;
    }
  },
  onNewWorld: () => {
    game.reset(Date.now() >>> 0, { startTime: save.startTime });
    world.snapCamera = true;
    ui.showToast("正在展开新的山域");
  },
  onPause: pause,
  onResume: resume,
  onHome: home,
  onSettings: () => {
    if (game.state.phase === "playing") pause();
  },
  onSound: (enabled) => {
    save.sound = typeof enabled === "boolean" ? enabled : !save.sound;
    audio.unlock().catch(() => {});
    audio.setEnabled(save.sound);
    ui.setSound(save.sound);
    persist();
  },
  onQuality: async (quality) => {
    const requested = normalizeQuality(quality);
    if (await world?.setQuality(requested)) {
      save.quality = requested;
      persist();
    } else ui.setQuality(save.quality);
  },
  onMotion: (enabled) => {
    save.motion = enabled;
    world?.setMotion(enabled);
    persist();
  },
  onRetryAssets: async () => {
    const requested = world.requestedQuality || save.quality;
    if (await world.setQuality(requested)) {
      save.quality = requested;
      persist();
    }
  },
  onFullscreen: async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      ui.showToast("当前浏览器不支持全屏，可以放大窗口游玩");
    }
  },
  onSkin: (id) => {
    if (!canUseSkin(id, save.totalCoins)) return;
    save.skin = id;
    world?.setSkin(id);
    ui.setSkin(id);
    persist();
  },
  onTouch: (action, pressed) => {
    if (pressed) {
      touches.add(action);
      if (action === "jump") {
        jumpQueued = true;
        jumpStarted = performance.now();
      }
      audio.unlock().catch(() => {});
    } else touches.delete(action);
  },
});

function persist() {
  writeSave(save);
  ui.updateSave(save);
}

function bank() {
  if (banked || game.state.elapsed < 0.1) return;
  save = bankRun(save, game.state);
  banked = true;
  persist();
}

function clearInput() {
  keys.clear();
  touches.clear();
  jumpQueued = false;
  accumulator = 0;
  joystick = { x: 0, y: 0 };
  observing = false;
}

function start(retry = false) {
  if (!world?.materials.ready || !world.terrainChunks.ready || !ui.loaded)
    return;
  bank();
  clearInput();
  missionComplete.clear();
  game.reset(game.seed, { startTime: save.startTime });
  game.start();
  world.snapCamera = true;
  banked = false;
  lastAirTurns = 0;
  document.querySelector(".toast-stack").replaceChildren();
  ui.showScreen("playing");
  audio.unlock().catch(() => {});
  document.activeElement?.blur();
  ui.showToast(
    window.innerWidth < 700
      ? "摇杆自由转向 · 上推撑杖 / 下拉刹车"
      : "A/D 转向 · W 撑杖 · S 刹车 · 右键观察",
    "info",
  );
}

function pause() {
  if (game.state.phase !== "playing") return;
  game.pause();
  clearInput();
  ui.showScreen("paused");
}

function resume() {
  if (game.state.phase !== "paused") return;
  clearInput();
  game.resume();
  ui.showScreen("playing");
  audio.unlock().catch(() => {});
  document.activeElement?.blur();
}

function home() {
  bank();
  clearInput();
  game.reset();
  ui.showScreen("menu");
  ui.updateSave(save);
}

function currentInput() {
  return buildInput({
    keys,
    touches,
    jumpQueued,
    heldMilliseconds: performance.now() - jumpStarted,
    grounded: game.state.grounded,
    joystick,
  });
}

const gameKeys = [
  "Space",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "KeyA",
  "KeyD",
  "KeyW",
  "KeyS",
  "KeyQ",
  "KeyE",
  "KeyF",
  "ShiftLeft",
  "ShiftRight",
];
window.addEventListener("keydown", (event) => {
  const modalOpen = Boolean(document.querySelector(".modal:not([hidden])"));
  if (["Escape", "KeyP"].includes(event.code) && !event.repeat) {
    if (modalOpen) return;
    event.preventDefault();
    if (game.state.phase === "playing") pause();
    else if (game.state.phase === "paused") resume();
    return;
  }
  if (game.state.phase !== "playing") return;
  if (gameKeys.includes(event.code)) event.preventDefault();
  if (!keys.has(event.code) && event.code === "Space") {
    jumpQueued = true;
    jumpStarted = performance.now();
  }
  keys.add(event.code);
});
window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});
window.addEventListener("blur", () => {
  if (game.state.phase === "playing") pause();
  clearInput();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause();
});
window.addEventListener("resize", () => world?.resize());
window.addEventListener("pagehide", () => bank());

try {
  world = new SkiWorld(
    document.querySelector("#game-canvas"),
    save.quality,
    (state) => ui.setAssetState(state),
  );
  world.setSkin(save.skin);
  world.setMotion(save.motion);
  ui.updateSave(save);
  ui.setSound(save.sound);
  ui.setQuality(save.quality);
  ui.setSkin(save.skin);
  ui.setLoading(false);
} catch (error) {
  console.error("3D 场景初始化失败", error);
  const message = document.createElement("section");
  message.className = "webgl-error";
  message.innerHTML =
    '<h1>雪山正在等你</h1><p>当前浏览器无法启动 3D 画面。请开启浏览器的硬件加速，或使用新版 Chrome / Edge 后重试。</p><button type="button">重新加载</button>';
  message
    .querySelector("button")
    .addEventListener("click", () => location.reload());
  document.body.append(message);
}

document
  .querySelector("#game-canvas")
  .addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    pause();
    ui.showToast("画面连接中断，请刷新页面恢复", "warning");
  });

let lastFrame = performance.now();
const viewCanvas = document.querySelector("#game-canvas");
let orbitPointer = null,
  lastOrbitX = 0;
viewCanvas.addEventListener("contextmenu", (e) => e.preventDefault());
viewCanvas.addEventListener("pointerdown", (e) => {
  if (
    game.state.phase !== "playing" ||
    (e.button !== 2 && e.pointerType !== "touch")
  )
    return;
  orbitPointer = e.pointerId;
  lastOrbitX = e.clientX;
  observing = true;
  viewCanvas.setPointerCapture(e.pointerId);
});
viewCanvas.addEventListener("pointermove", (e) => {
  if (e.pointerId === orbitPointer) {
    world.setOrbit(-(e.clientX - lastOrbitX) * 0.006);
    lastOrbitX = e.clientX;
  }
});
for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
  viewCanvas.addEventListener(event, (e) => {
    if (e.pointerId === orbitPointer) {
      orbitPointer = null;
      observing = false;
    }
  });
let lastUiUpdate = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (!world) return;
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  let input = { ...currentInput(), observing };
  if (game.state.phase === "playing") {
    accumulator += dt;
    // 固定步长保证高刷新率和普通屏幕有一致手感。
    while (accumulator >= 1 / 90) {
      const p = game.state.position,
        v = game.state.velocity;
      if (!world.terrainChunks.canEnter(p.x + v.x / 45, p.z + v.z / 45)) {
        accumulator = 0;
        break;
      }
      game.update(1 / 90, input);
      jumpQueued = false;
      input = { ...input, jump: false };
      accumulator -= 1 / 90;
    }
  }
  for (const event of game.drainEvents()) {
    world.onEvent(event);
    audio.play(event.type);
    if (
      ["flip", "ramp", "powerup", "boost", "avalanche-warning"].includes(
        event.type,
      )
    ) {
      ui.showToast(
        event.label + (event.type === "flip" ? ` +${event.value}` : ""),
        event.type === "crash" ? "warning" : "success",
      );
    }
    if (event.type === "gameover") {
      const previousBest = save.openBestDistance;
      bank();
      clearInput();
      ui.showResults(
        { ...game.state, newRecord: game.state.distance > previousBest },
        save,
      );
    }
  }
  if (game.state.phase === "playing" && game.state.airTurns > lastAirTurns)
    audio.play("airturn", game.state.airTurns);
  lastAirTurns = game.state.airTurns || 0;
  if (game.state.phase === "playing") {
    [
      [game.state.distance >= 500, "distance", "500 米达成！继续探索雪谷"],
      [game.state.coins >= 20, "coins", "收集 20 枚金币，做得漂亮！"],
      [game.state.flips >= 3, "flips", "3 圈翻转完成！雪山技巧家"],
    ].forEach(([complete, id, text]) => {
      if (complete && !missionComplete.has(id)) {
        missionComplete.add(id);
        ui.showToast(text, "success");
        audio.play("powerup");
      }
    });
  }
  audio.update(game.state);
  world.render(game.state, dt, input);
  const terrainReady =
    game.state.phase === "menu"
      ? world.terrainChunks.panoramaReady
      : world.terrainChunks.ready;
  if (world.materials.ready && !world.loadingState?.error) {
    ui.setLoading(terrainReady);
    const status = document.querySelector("[data-asset-status]");
    if (!terrainReady) {
      status.hidden = false;
      ui.write("[data-asset-message]", "正在展开周围山域…");
    } else if (!world.loadingState.warning) status.hidden = true;
  }
  if (now - lastUiUpdate > 70) {
    ui.update(game.state, save);
    lastUiUpdate = now;
  }
}
requestAnimationFrame(frame);

window.addEventListener("pagehide", (event) => {
  if (!event.persisted) world?.dispose();
});

// 开发模式提供可观察状态，正式构建不暴露调试接口。
if (import.meta.env.DEV)
  window.__POWDER__ = {
    game,
    world,
    ui,
    getSave: () => ({ ...save }),
    getInput: currentInput,
  };
