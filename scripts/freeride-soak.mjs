import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { launch, waitReady, OUTPUT, quality } from "./freeride-qa.mjs";
await mkdir(OUTPUT, { recursive: true });
const browser = await launch();
try {
  const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    }),
    page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5173");
  await waitReady(page);
  await quality(page, "high");
  await page.getByRole("button", { name: "开始滑雪冒险", exact: true }).click();
  const gpu = await page.evaluate(() => {
    const gl = __POWDER__.world.renderer.getContext(),
      e = gl.getExtension("WEBGL_debug_renderer_info");
    return e
      ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
  });
  const samples = [],
    start = Date.now();
  let last = 0,
    restarts = 0;
  await page.evaluate(() => {
    window.__frames = [];
    let previous = performance.now();
    const tick = (now) => {
      __frames.push(now - previous);
      previous = now;
      if (__frames.length > 10000) __frames.shift();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  while (Date.now() - start < 900000) {
    const s = await page.evaluate(() => {
      const a = __POWDER__,
        s = a.game.state;
      return {
        phase: s.phase,
        heading: s.heading,
        gradient: a.game.terrain(s.position.x, s.position.z).gradient,
      };
    });
    if (s.phase === "over") {
      restarts++;
      await page.getByRole("button", { name: "再来一趟", exact: true }).click();
    } else {
      const target =
          Math.atan2(-s.gradient.x, s.gradient.z) +
          Math.sin((Date.now() - start) / 9000) * 0.22,
        d = Math.atan2(
          Math.sin(target - s.heading),
          Math.cos(target - s.heading),
        );
      await page.keyboard.up("a");
      await page.keyboard.up("d");
      if (Math.abs(d) > 0.08) await page.keyboard.down(d > 0 ? "d" : "a");
      await page.keyboard.down("w");
    }
    await page.waitForTimeout(500);
    const minute = Math.floor((Date.now() - start) / 60000);
    if (minute > last) {
      last = minute;
      const sample = await page.evaluate(() => {
        const a = __POWDER__,
          frames = __frames.splice(0).sort((a, b) => a - b),
          mean = frames.reduce((a, b) => a + b, 0) / frames.length;
        return {
          elapsed: a.game.state.elapsed,
          distance: a.game.state.distance,
          position: a.game.state.position,
          meanMs: +mean.toFixed(2),
          p95Ms: +frames[Math.floor(frames.length * 0.95)].toFixed(2),
          fps: +(1000 / mean).toFixed(1),
          memory: a.world.renderer.info.memory,
          chunks: a.world.terrainChunks.chunks.size,
          cache: a.world.terrainChunks.cache.size,
          entities: a.game.state.entities.length,
        };
      });
      samples.push({ minute, ...sample });
      console.log(JSON.stringify(samples.at(-1)));
      await writeFile(
        path.join(OUTPUT, "soak.json"),
        JSON.stringify(
          {
            gpu,
            seconds: (Date.now() - start) / 1000,
            restarts,
            errors,
            samples,
          },
          null,
          2,
        ),
      );
    }
  }
  for (const k of ["a", "d", "w"]) await page.keyboard.up(k);
  await page.keyboard.press("p");
  console.log(
    "SOAK COMPLETE",
    JSON.stringify({ seconds: (Date.now() - start) / 1000, restarts, errors }),
  );
  const performance = [];
  for (const q of ["ultra", "high", "low"]) {
    await quality(page, q);
    await page.evaluate(() => {
      const a = __POWDER__;
      a.game.reset(20260905);
      a.game.start();
      a.ui.showScreen("playing");
    });
    await page.waitForFunction(
      () => __POWDER__.world.terrainChunks.panoramaReady,
    );
    await page.keyboard.down("w");
    await page.waitForTimeout(2000);
    await page.evaluate(() => __frames.splice(0));
    await page.waitForTimeout(30000);
    const result = await page.evaluate(() => {
      const frames = __frames.splice(0).sort((a, b) => a - b),
        mean = frames.reduce((a, b) => a + b, 0) / frames.length;
      return {
        meanMs: +mean.toFixed(2),
        fps: +(1000 / mean).toFixed(1),
        p95Ms: +frames[Math.floor(frames.length * 0.95)].toFixed(2),
        memory: __POWDER__.world.renderer.info.memory,
      };
    });
    await page.keyboard.up("w");
    await page.keyboard.press("p");
    performance.push({ quality: q, width: 1920, height: 1080, ...result });
    console.log("performance", q, result);
  }
  await writeFile(
    path.join(OUTPUT, "performance.json"),
    JSON.stringify({ gpu, samples: performance }, null, 2),
  );
} finally {
  await browser.close();
}
