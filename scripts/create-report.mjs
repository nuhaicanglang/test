import {
  mkdir,
  readFile,
  copyFile,
  writeFile,
  readdir,
} from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, ".."),
  source = path.join(root, "work/freeride-qa");
const output = path.resolve(
  process.argv[2] || path.join(root, "work/delivery"),
);
await mkdir(output, { recursive: true });
await mkdir(path.join(output, "images"), { recursive: true });
for (const name of await readdir(source))
  if (name.endsWith(".png"))
    await copyFile(path.join(source, name), path.join(output, "images", name));
for (const name of [
  "checks.json",
  "soak.json",
  "performance.json",
  "exploratory.json",
])
  await copyFile(path.join(source, name), path.join(output, name));
await copyFile(
  path.join(root, "public/materials/manifest.json"),
  path.join(output, "素材清单.json"),
);
await copyFile(path.join(root, "CREDITS.md"), path.join(output, "素材许可.md"));
try {
  await copyFile(
    path.join(root, "work/before/menu.png"),
    path.join(output, "images/before.png"),
  );
} catch {}
const checks = JSON.parse(
    await readFile(path.join(source, "checks.json"), "utf8"),
  ),
  perf = JSON.parse(
    await readFile(path.join(source, "performance.json"), "utf8"),
  ),
  soak = JSON.parse(await readFile(path.join(source, "soak.json"), "utf8"));
const names = [
  "高山粉雪盆地",
  "针叶林坡",
  "陡峭雪槽",
  "冰川地带",
  "风蚀山脊",
  "峡谷台地",
  "冰湖与雪原",
  "山间聚落谷地",
];
const figure = (name, label) =>
  `<figure><a href="images/${name}.png"><img src="images/${name}.png" loading="lazy" alt="${label}"></a><figcaption>${label}</figcaption></figure>`;
const html = `<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>POWDER · 无界山域验收</title><style>*{box-sizing:border-box}body{margin:0;background:#0c1b27;color:#e1edf3;font:15px/1.7 system-ui}main{max-width:1400px;padding:50px 30px;margin:auto}h1{font-size:50px;line-height:1.15}h2{margin-top:42px}p,figcaption{color:#a7c0d0}a{color:#f5a373;text-decoration:none}.grid{display:grid;grid-template-columns:1fr 1fr;gap:22px}figure{margin:0}img{display:block;width:100%;border:1px solid #345165;border-radius:4px}figcaption{padding:8px 0}table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:12px;border-bottom:1px solid #304756}.mobile{display:flex;gap:18px}.mobile figure{width:30%}.tag{color:#f5a373;letter-spacing:3px;font-size:12px}@media(max-width:700px){main{padding:28px 18px}h1{font-size:35px}.grid{grid-template-columns:1fr}}</style><main><div class="tag">POWDER / THE UNBOUNDED</div><h1>旷野没有边界。</h1><p>无限山域、360° 自由滑行、地形雪崩、动态昼夜与天气。保留七组本地 CC0 材质、运动装备与三档画质。</p><a href="http://localhost:5173/">打开本地游戏 →</a><h2>实现与浏览器验收</h2><p>${checks.passed} 项浏览器检查通过；90 秒实际键盘探索、手机摇杆和跳跃、设置与资源失败重试。长期运行 ${Math.round(soak.seconds)} 秒，期间自动重新挑战 ${soak.restarts} 次，浏览器异常 ${soak.errors.length} 条。</p><p>单元测试结果与两项既有计圈失败详见项目验收记录。固定种子为 20260905；截图使用对应区域坐标与明确时段。旧首页仅作整体风格参考，自由世界重构后不宣称与旧跑道同机位。</p><div class="grid">${figure("before", "升级前首页")}${figure("menu", "无限山域首页")}</div><h2>实机性能 / 1920 × 1080</h2><p>${perf.gpu}，Edge 硬件加速。每档连续采样 30 秒；实际结果受区域密度和窗口状态影响。</p><table><tr><th>画质</th><th>平均 FPS</th><th>平均帧时间</th><th>P95</th></tr>${perf.samples.map((s) => `<tr><td>${{ ultra: "极致", high: "精细", low: "流畅" }[s.quality]}</td><td>${s.fps}</td><td>${s.meanMs} ms</td><td>${s.p95Ms} ms</td></tr>`).join("")}</table><p><a href="performance.json">性能原始记录</a> · <a href="soak.json">15 分钟稳定性记录</a> · <a href="checks.json">浏览器检查</a> · <a href="exploratory.json">探索操作记录</a></p><h2>八类连续山域</h2><div class="grid">${names.map((n, i) => figure("biome-" + i, n)).join("")}</div><h2>四个出发时段</h2><div class="grid">${[
  ["dawn", "清晨"],
  ["noon", "正午"],
  ["sunset", "日落"],
  ["night", "夜间"],
]
  .map(([n, t]) => figure("time-" + n, t))
  .join(
    "",
  )}</div><h2>腾空、雪崩与风雪</h2><div class="grid">${figure("airborne", "峡谷腾空")}${figure("avalanche", "雪崩与落地扬雪")}${figure("blizzard", "夜间风雪与装备照明")}</div><h2>手机界面</h2><div class="mobile">${figure("mobile-menu", "390 × 844 首页")}${figure("mobile-play", "摇杆与独立动作")}${figure("mobile-settings", "360 × 740 设置")}</div><h2>素材与许可</h2><p><a href="素材清单.json">作者、来源、加工与校验值</a> · <a href="素材许可.md">完整许可说明</a></p><p>生成于 ${new Date().toISOString()}。代码已按用户要求在最终验收前推送 GitHub；本次未部署服务器。</p></main></html>`;
await writeFile(path.join(output, "无限山域验收.html"), html);
console.log(output);
