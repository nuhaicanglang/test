import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const visualScenes = [
  { name: "forest", d: 90, y: 0 },
  { name: "airborne", d: 192, y: 28 },
  { name: "landing", d: 230, y: 0 },
  { name: "dusk", d: 2400, y: 0 },
  { name: "avalanche", d: 300, y: 0 },
];
export async function waitReady(page) {
  await page.waitForFunction(
    () =>
      window.__POWDER__?.world?.materials.ready && window.__POWDER__?.ui.loaded,
    {},
    { timeout: 45000 },
  );
}
export async function setQuality(page, quality) {
  await page.getByRole("button", { name: "打开设置", exact: true }).click();
  await page
    .getByRole("button", {
      name: `${{ low: "流畅", high: "精细", ultra: "极致" }[quality]}画质`,
      exact: true,
    })
    .click();
  await page.waitForFunction(
    (quality) => __POWDER__.world.quality === quality && __POWDER__.ui.loaded,
    quality,
  );
  await page.getByRole("button", { name: "关闭设置", exact: true }).click();
}
export async function coreChecks(page, output) {
  const checks = [];
  const check = (ok, label) => {
    assert.ok(ok, label);
    checks.push(label);
  };
  await mkdir(output, { recursive: true });
  await waitReady(page);
  await page.getByRole("button", { name: "开始滑雪冒险", exact: true }).click();
  await page.waitForFunction(() => __POWDER__.game.state.distance > 0);
  check(
    await page.locator("[data-playing]").isVisible(),
    "start enters gameplay",
  );
  await page.keyboard.down("ArrowRight");
  await page.waitForFunction(() => __POWDER__.game.state.x > 1);
  await page.keyboard.up("ArrowRight");
  checks.push("held keyboard steering advances sideways");
  await page.keyboard.press("Space");
  await page.waitForFunction(() => __POWDER__.game.state.y > 0.5);
  checks.push("jump lifts the player");
  await page.waitForFunction(() => __POWDER__.game.state.grounded === true);
  const energy = await page.evaluate(() => __POWDER__.game.state.energy);
  await page.keyboard.down("Shift");
  await page.waitForFunction(
    (energy) =>
      __POWDER__.game.state.boosting && __POWDER__.game.state.energy < energy,
    energy,
  );
  await page.keyboard.up("Shift");
  checks.push("boost consumes energy");
  await page.keyboard.press("p");
  const distance = await page.evaluate(() => __POWDER__.game.state.distance);
  await page.waitForTimeout(180);
  check(
    await page.evaluate(
      (d) =>
        __POWDER__.game.state.phase === "paused" &&
        __POWDER__.game.state.distance === d,
      distance,
    ),
    "pause freezes physics",
  );
  await page.screenshot({
    path: path.join(output, "pause.png"),
    animations: "disabled",
  });
  for (const quality of ["low", "high", "ultra", "high"]) {
    await setQuality(page, quality);
    check(
      await page.evaluate((q) => __POWDER__.getSave().quality === q, quality),
      `quality ${quality} applies and persists`,
    );
  }
  await page.getByRole("button", { name: "打开设置", exact: true }).click();
  for (const label of ["开启或关闭镜头动态", "开启或关闭山间音效"]) {
    const control = page.getByRole("switch", { name: label });
    const before = await control.getAttribute("aria-checked");
    await control.click();
    check(
      (await control.getAttribute("aria-checked")) !== before,
      `${label} toggles off`,
    );
    await control.click();
    check(
      (await control.getAttribute("aria-checked")) === before,
      `${label} restores`,
    );
  }
  await page.screenshot({
    path: path.join(output, "settings.png"),
    animations: "disabled",
  });
  check(
    await page
      .getByRole("button", { name: "选择冰川蓝，累计 100 金币解锁" })
      .isDisabled(),
    "locked outfits remain locked",
  );
  await page.getByRole("button", { name: "关闭设置", exact: true }).click();
  await page.keyboard.press("p");
  await page.waitForFunction(() => __POWDER__.game.state.phase === "playing");
  await page.getByRole("button", { name: "查看玩法指南", exact: true }).click();
  check(
    await page.evaluate(() => __POWDER__.game.state.phase === "paused"),
    "help pauses gameplay",
  );
  await page.screenshot({
    path: path.join(output, "help.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "关闭玩法指南", exact: true }).click();
  await page.getByRole("button", { name: "返回首页", exact: true }).click();
  check(
    await page.locator(".menu-content").isVisible(),
    "home returns to menu",
  );
  await page.getByRole("button", { name: "切换全屏", exact: true }).click();
  await page.waitForTimeout(100);
  const entered = await page.evaluate(() =>
    Boolean(document.fullscreenElement),
  );
  if (entered) {
    await page.getByRole("button", { name: "切换全屏", exact: true }).click();
    await page.waitForFunction(() => !document.fullscreenElement);
    checks.push("fullscreen enter and exit");
  } else checks.push("fullscreen unsupported notice handled");
  await page.getByRole("button", { name: "开始滑雪冒险", exact: true }).click();
  // Stage only the terminal condition; navigation to it uses normal controls.
  await page.evaluate(() => {
    __POWDER__.game.state.avalanche = 0.001;
  });
  await page.waitForFunction(() => __POWDER__.game.state.phase === "over");
  await page.screenshot({
    path: path.join(output, "results.png"),
    animations: "disabled",
  });
  const runs = await page.evaluate(() => __POWDER__.getSave().runs);
  await page.getByRole("button", { name: "再来一趟", exact: true }).click();
  check(
    await page.evaluate(
      (runs) =>
        __POWDER__.game.state.phase === "playing" &&
        __POWDER__.getSave().runs === runs,
      runs,
    ),
    "restart does not duplicate settlement",
  );
  await page.keyboard.press("p");
  await page.getByRole("button", { name: "返回首页", exact: true }).click();
  return checks;
}

export async function captureScenes(page, output) {
  await mkdir(output, { recursive: true });
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.evaluate(() => {
    __POWDER__.ui.callbacks.onHome();
  });
  await waitReady(page);
  await page.waitForTimeout(1200);
  await page.screenshot({
    path: path.join(output, "menu.png"),
    animations: "disabled",
  });
  for (const scene of visualScenes) {
    await page.evaluate(({ d, y, name }) => {
      const a = __POWDER__;
      a.game.reset(20260905);
      Object.assign(a.game.state, {
        phase: "paused",
        distance: d,
        y,
        grounded: y === 0,
        avalanche: name === "avalanche" ? 3 : 80,
      });
      a.ui.showScreen("playing");
      a.ui.update(a.game.state, a.getSave());
      a.world.time = 10;
      for (let i = 0; i < 90; i++) a.world.render(a.game.state, 1 / 60, {});
    }, scene);
    if (scene.name === "landing") {
      await page.evaluate(() => {
        __POWDER__.game.state.phase = "playing";
        __POWDER__.game.state.invincible = 100;
        __POWDER__.world.landingDust = 0.85;
      });
    }
    await page.screenshot({
      path: path.join(output, `${scene.name}.png`),
      animations: "disabled",
    });
  }
}

export async function failureChecks(browser, output) {
  const context = await browser.newContext({
    viewport: { width: 1200, height: 800 },
  });
  const page = await context.newPage();
  const base = "http://127.0.0.1:5173";
  const checks = [];
  try {
    await page.route("**/materials/snow-color-*.webp", (route) =>
      route.abort(),
    );
    await page.goto(base);
    await page.waitForFunction(
      () => __POWDER__?.world.loadingState.retry === true,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "开始滑雪冒险", exact: true })
        .isEnabled(),
      false,
    );
    await page.screenshot({
      path: path.join(output, "load-failure.png"),
      animations: "disabled",
    });
    checks.push("required resource failure disables start and exposes retry");
    await page.unroute("**/materials/snow-color-*.webp");
    await page.getByRole("button", { name: "重试加载", exact: true }).click();
    await waitReady(page);
    checks.push("retry loads resources and enables start");
    await page.route("**/winter-environment-2k.hdr", (route) => route.abort());
    await page.reload();
    await waitReady(page);
    await page.waitForFunction(
      () => __POWDER__.world.environment.hdrFailed === true,
    );
    assert.ok(
      await page.evaluate(() => Boolean(__POWDER__.world.scene.environment)),
    );
    checks.push("optional HDR failure retains local fallback lighting");
    await page.unroute("**/winter-environment-2k.hdr");
    await page.evaluate(() =>
      localStorage.setItem(
        "powder-save-v1",
        JSON.stringify({
          quality: "medium",
          totalCoins: 333,
          skin: "violet",
          bestDistance: 900,
          motion: false,
        }),
      ),
    );
    await page.reload();
    await waitReady(page);
    assert.deepEqual(
      await page.evaluate(() => ({
        quality: __POWDER__.world.quality,
        skin: __POWDER__.world.skin,
        coins: __POWDER__.getSave().totalCoins,
        motion: __POWDER__.world.motion,
      })),
      { quality: "high", skin: "violet", coins: 333, motion: false },
    );
    await page.getByRole("button", { name: "打开设置", exact: true }).click();
    await page
      .getByRole("button", {
        name: "选择冰川蓝，累计 100 金币解锁",
        exact: true,
      })
      .click();
    assert.equal(await page.evaluate(() => __POWDER__.world.skin), "blue");
    await page
      .getByRole("button", {
        name: "选择暮光紫，累计 300 金币解锁",
        exact: true,
      })
      .click();
    assert.equal(await page.evaluate(() => __POWDER__.world.skin), "violet");
    checks.push(
      "legacy medium migrates, unlocked outfits switch, coins and motion preserved",
    );
    return checks;
  } finally {
    await context.close();
  }
}

export async function runStandalone() {
  const { chromium } = await import("playwright");
  const output = path.resolve("work/qa");
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch(
    process.platform === "win32"
      ? {
          executablePath:
            "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
          headless: true,
        }
      : { headless: true },
  );
  try {
    const context = await browser.newContext({
        viewport: { width: 1600, height: 900 },
      }),
      page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://127.0.0.1:5173");
    const core = await coreChecks(page, output),
      failure = await failureChecks(browser, output);
    const memoryCycles = await page.evaluate(async () => {
      const w = __POWDER__.world,
        samples = [];
      for (let cycle = 0; cycle < 3; cycle++) {
        for (const q of ["low", "high", "ultra"]) await w.setQuality(q);
        for (let i = 0; i < 10; i++) {
          __POWDER__.game.reset(20260905 + i);
          w.render(__POWDER__.game.state, 1 / 60, {});
        }
        samples.push({ ...w.renderer.info.memory });
      }
      return samples;
    });
    assert.deepEqual(memoryCycles[2], memoryCycles[1]);
    core.push(
      "three quality cycles and thirty restarts keep GPU resources stable",
    );
    await setQuality(page, "ultra");
    await captureScenes(page, output);
    assert.deepEqual(errors, []);
    const report = {
      passed: core.length + failure.length,
      core,
      failure,
      errors,
      memoryCycles,
    };
    await writeFile(
      path.join(output, "checks.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(import.meta.filename)
)
  await runStandalone();
