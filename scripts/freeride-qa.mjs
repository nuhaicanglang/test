import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
export const ROOT = path.resolve(import.meta.dirname, "..");
export const OUTPUT = path.join(ROOT, "work/freeride-qa");
export async function launch() {
  return chromium.launch(
    process.platform === "win32"
      ? {
          executablePath:
            "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
          headless: true,
        }
      : { headless: true },
  );
}
export async function waitReady(page) {
  await page.waitForFunction(
    () =>
      window.__POWDER__?.world.materials.ready &&
      __POWDER__.world.terrainChunks.panoramaReady &&
      __POWDER__.ui.loaded,
    {},
    { timeout: 90000 },
  );
}
export async function stage(page, biome = 0, startTime = "dawn", extra = {}) {
  await page.evaluate(
    async ({ biome, startTime, extra }) => {
      const { findBiome, sampleTerrain } = await import(
        "/src/mountain-field.js"
      );
      const { environmentState } = await import("/src/world-weather.js");
      const a = __POWDER__,
        r = findBiome(biome, 20260905);
      a.game.reset(20260905, { startTime, position: { x: r.x, z: r.z } });
      a.game.start();
      a.game.pause();
      a.ui.showScreen("playing");
      const s = a.game.state,
        g = sampleTerrain(r.x, r.z, 20260905).gradient;
      s.heading = Math.atan2(-g.x, g.z);
      Object.assign(s, extra);
      if (extra.y) {
        s.position.y += extra.y;
        s.grounded = false;
        s.airTime = 1;
      }
      s.environment = environmentState(
        20260905,
        extra.elapsed || 0,
        r.x,
        r.z,
        startTime,
      );
      a.world.snapCamera = true;
      a.world.render(s, 1 / 60, {});
    },
    { biome, startTime, extra },
  );
  await page.waitForFunction(
    () => __POWDER__.world.terrainChunks.panoramaReady,
    {},
    { timeout: 90000 },
  );
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        let n = 0;
        function tick() {
          if (++n >= 35) resolve();
          else requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      }),
  );
}
export async function quality(page, q) {
  await page.evaluate(async (q) => {
    await __POWDER__.world.setQuality(q);
  }, q);
  await page.waitForFunction(
    (q) =>
      __POWDER__.world.quality === q &&
      __POWDER__.world.terrainChunks.panoramaReady,
    q,
    { timeout: 90000 },
  );
}
export async function coreChecks(page) {
  const checks = [];
  const check = (ok, name) => {
    assert.ok(ok, name);
    checks.push(name);
  };
  await waitReady(page);
  await page.screenshot({ path: path.join(OUTPUT, "menu.png") });
  for (const t of ["noon", "sunset", "night", "dawn"]) {
    await page.locator(`[data-time="${t}"]`).click();
    await page.waitForFunction((t) => __POWDER__.getSave().startTime === t, t);
    checks.push(`departure ${t} persists`);
  }
  const seed = await page.evaluate(() => __POWDER__.game.seed);
  await page.locator('[data-action="new-world"]').click();
  await waitReady(page);
  check(
    await page.evaluate((old) => __POWDER__.game.seed !== old, seed),
    "new mountain changes seed",
  );
  await page.getByRole("button", { name: "开始滑雪冒险", exact: true }).click();
  await page.waitForFunction(() => __POWDER__.game.state.distance > 2);
  checks.push("start enters 2D world");
  await page.keyboard.down("d");
  await page.waitForFunction(() => __POWDER__.game.state.position.x > 9);
  await page.keyboard.up("d");
  checks.push("turning passes former lane boundary");
  await page.keyboard.press("Space");
  await page.waitForFunction(() => __POWDER__.game.state.y > 0.3);
  checks.push("keyboard jump lifts athlete");
  await page.keyboard.down("Shift");
  await page.waitForFunction(() => __POWDER__.game.state.energy < 98);
  await page.keyboard.up("Shift");
  checks.push("boost consumes energy");
  await page.keyboard.press("p");
  const paused = await page.evaluate(() =>
    JSON.stringify({
      p: __POWDER__.game.state.position,
      e: __POWDER__.game.state.elapsed,
      env: __POWDER__.game.state.environment,
    }),
  );
  await page.waitForTimeout(300);
  check(
    await page.evaluate(
      (before) =>
        JSON.stringify({
          p: __POWDER__.game.state.position,
          e: __POWDER__.game.state.elapsed,
          env: __POWDER__.game.state.environment,
        }) === before,
      paused,
    ),
    "pause freezes space and environment",
  );
  await page.screenshot({ path: path.join(OUTPUT, "pause.png") });
  const runSeed = await page.evaluate(() => __POWDER__.game.seed);
  await page.getByRole("button", { name: "重新开始", exact: true }).click();
  await page.waitForFunction(() => __POWDER__.game.state.phase === "playing");
  check(
    await page.evaluate((seed) => __POWDER__.game.seed === seed, runSeed),
    "restart uses same seed",
  );
  await page.keyboard.press("p");
  for (const q of ["low", "high", "ultra", "high"]) {
    await page.getByRole("button", { name: "打开设置", exact: true }).click();
    await page.locator(`[data-quality="${q}"]`).click();
    await page.waitForFunction(
      (q) =>
        __POWDER__.world.quality === q && __POWDER__.getSave().quality === q,
      q,
      { timeout: 60000 },
    );
    await page.getByRole("button", { name: "关闭设置", exact: true }).click();
    checks.push(`quality ${q} round-trip`);
  }
  await page.getByRole("button", { name: "打开设置", exact: true }).click();
  for (const name of ["开启或关闭镜头动态", "开启或关闭山间音效"]) {
    const b = page.getByRole("switch", { name, exact: true });
    const before = await b.getAttribute("aria-checked");
    await b.click();
    await page.waitForTimeout(120);
    check((await b.getAttribute("aria-checked")) !== before, `${name} toggles`);
    await b.click();
  }
  check(
    await page.locator('[data-skin="violet"]').isDisabled(),
    "unearned outfit remains locked",
  );
  await page.screenshot({ path: path.join(OUTPUT, "settings.png") });
  await page.getByRole("button", { name: "关闭设置", exact: true }).click();
  await page.getByRole("button", { name: "继续冒险", exact: true }).click();
  await page.getByRole("button", { name: "查看玩法指南", exact: true }).click();
  check(
    await page.evaluate(() => __POWDER__.game.state.phase === "paused"),
    "help pauses play",
  );
  await page.screenshot({ path: path.join(OUTPUT, "help.png") });
  await page.getByRole("button", { name: "关闭玩法指南", exact: true }).click();
  await page.getByRole("button", { name: "返回首页", exact: true }).click();
  await waitReady(page);
  await page.getByRole("button", { name: "切换全屏", exact: true }).click();
  await page.waitForFunction(() => !!document.fullscreenElement);
  await page.getByRole("button", { name: "切换全屏", exact: true }).click();
  await page.waitForFunction(() => !document.fullscreenElement);
  checks.push("full screen enters and exits");
  return checks;
}
export async function mobileChecks(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:5173");
  await waitReady(page);
  assert.equal(await page.evaluate(() => __POWDER__.world.quality), "low");
  await page.screenshot({ path: path.join(OUTPUT, "mobile-menu.png") });
  await page.getByRole("button", { name: "开始滑雪冒险", exact: true }).tap();
  await page.waitForFunction(() => __POWDER__.game.state.distance > 1);
  const box = await page.locator("[data-joystick]").boundingBox();
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  const session = await context.newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: x + 36, y: y - 12 }],
  });
  await page.waitForFunction(() => __POWDER__.game.state.heading > 0.3);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  assert.equal(await page.evaluate(() => __POWDER__.getInput().steer), 0);
  await page.locator('[data-touch="jump"]').tap();
  await page.waitForFunction(() => __POWDER__.game.state.y > 0.2);
  await page.screenshot({ path: path.join(OUTPUT, "mobile-play.png") });
  await page.keyboard.press("p");
  await page.getByRole("button", { name: "打开设置", exact: true }).tap();
  await page.setViewportSize({ width: 360, height: 740 });
  await page.screenshot({
    path: path.join(OUTPUT, "mobile-settings.png"),
    animations: "disabled",
  });
  const bounds = await page.locator("[data-settings]").boundingBox();
  assert.ok(
    bounds.x >= 0 &&
      bounds.y >= 0 &&
      bounds.x + bounds.width <= 361 &&
      bounds.y + bounds.height <= 741,
  );
  await context.close();
  return [
    "mobile defaults low",
    "touch joystick turns and releases",
    "touch jump",
    "360px settings fit",
  ];
}
export async function captureScenes(page) {
  await quality(page, "ultra");
  for (let i = 0; i < 8; i++) {
    await stage(page, i, "dawn");
    await page.screenshot({ path: path.join(OUTPUT, `biome-${i}.png`) });
  }
  for (const time of ["dawn", "noon", "sunset", "night"]) {
    await stage(page, 1, time);
    await page.screenshot({ path: path.join(OUTPUT, `time-${time}.png`) });
  }
  await stage(page, 5, "noon", { y: 28 });
  await page.screenshot({ path: path.join(OUTPUT, "airborne.png") });
  await stage(page, 0, "sunset");
  await page.evaluate(() => {
    const a = __POWDER__,
      s = a.game.state;
    s.avalancheEvents = [
      {
        active: true,
        x: s.position.x - 25,
        z: s.position.z - 35,
        cells: Array.from({ length: 9 }, (_, i) => ({
          x: s.position.x - 55 + i * 9,
          z: s.position.z - 30,
          y: s.position.y - 10,
          radius: 12,
        })),
      },
    ];
    a.world.landingDust = 0.8;
    s.speed = 20;
  });
  await page.screenshot({ path: path.join(OUTPUT, "avalanche.png") });
  await stage(page, 4, "night");
  await page.evaluate(() => {
    Object.assign(__POWDER__.game.state.environment, {
      snow: 1,
      fog: 0.6,
      wind: 1,
      cloud: 0.9,
      label: "风雪",
    });
  });
  await page.screenshot({ path: path.join(OUTPUT, "blizzard.png") });
}
export async function exploratory(page, seconds = 90) {
  await page.evaluate(() => {
    const a = __POWDER__;
    a.game.reset(20260905, { startTime: "dawn" });
    a.ui.showScreen("menu");
  });
  await waitReady(page);
  await page.getByRole("button", { name: "开始滑雪冒险", exact: true }).click();
  const start = Date.now(),
    states = [];
  while (Date.now() - start < seconds * 1000) {
    let s = await page.evaluate(() => {
      const s = __POWDER__.game.state;
      return {
        phase: s.phase,
        heading: s.heading,
        slope: s.groundSlope,
        position: s.position,
        crashes: s.crashes,
        grounded: s.grounded,
        gradient: __POWDER__.game.terrain(s.position.x, s.position.z).gradient,
      };
    });
    if (s.phase === "over") {
      await page.getByRole("button", { name: "再来一趟", exact: true }).click();
      continue;
    }
    states.push(s);
    const target =
      Math.atan2(-s.gradient.x, s.gradient.z) +
      Math.sin((Date.now() - start) / 8000) * 0.5;
    const diff = Math.atan2(
      Math.sin(target - s.heading),
      Math.cos(target - s.heading),
    );
    await page.keyboard.up("a");
    await page.keyboard.up("d");
    if (Math.abs(diff) > 0.12) await page.keyboard.down(diff > 0 ? "d" : "a");
    await page.keyboard.down("w");
    if (states.length % 9 === 0) await page.keyboard.press("Space");
    if (states.length % 13 === 0) {
      await page.keyboard.press("p");
      await page.waitForTimeout(250);
      await page.keyboard.press("p");
    }
    await page.waitForTimeout(750);
  }
  for (const key of ["a", "d", "w"]) await page.keyboard.up(key);
  await page.keyboard.press("p");
  await writeFile(
    path.join(OUTPUT, "exploratory.json"),
    JSON.stringify(
      { durationSeconds: (Date.now() - start) / 1000, states },
      null,
      2,
    ),
  );
  return [
    "90 seconds ordinary keyboard exploration with turns, tuck, jumps and pauses",
  ];
}
export async function resourceCycles(page) {
  const samples = [];
  for (let cycle = 0; cycle < 3; cycle++) {
    for (const q of ["low", "high", "ultra"]) await quality(page, q);
    for (let i = 0; i < 10; i++) {
      await page.evaluate((seed) => {
        __POWDER__.game.reset(seed);
        __POWDER__.ui.showScreen("menu");
      }, 20260905 + i);
      await waitReady(page);
    }
    samples.push(
      await page.evaluate(() => ({
        ...__POWDER__.world.renderer.info.memory,
        chunks: __POWDER__.world.terrainChunks.chunks.size,
      })),
    );
    console.log("resource cycle", cycle, samples.at(-1));
  }
  assert.deepEqual(samples[2], samples[1]);
  return samples;
}
export async function run() {
  await mkdir(OUTPUT, { recursive: true });
  const browser = await launch();
  try {
    const context = await browser.newContext({
        viewport: { width: 1600, height: 900 },
      }),
      page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:5173");
    const core = await coreChecks(page);
    console.log("core checks complete");
    core.push(...(await exploratory(page)));
    const memoryCycles = await resourceCycles(page);
    console.log("resource cycles complete");
    await captureScenes(page);
    await context.close();
    const mobile = await mobileChecks(browser);
    const { failureChecks } = await import("./visual-qa.mjs");
    const failure = await failureChecks(browser, OUTPUT);
    assert.deepEqual(errors, []);
    const report = {
      passed: core.length + mobile.length + failure.length,
      core,
      mobile,
      failure,
      memoryCycles,
      errors,
    };
    await writeFile(
      path.join(OUTPUT, "checks.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(report);
  } finally {
    await browser.close();
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(import.meta.filename)
)
  await run();
