import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

// 通过真实浏览器的 DOM 和键盘事件验证输入与页面流程，规则边界由单元测试覆盖。
const script = String.raw`(async () => {
  const app = window.__POWDER__;
  if (!app) throw new Error('开发服务器未准备好');
  const results = [];
  const assert = (condition, text) => { if (!condition) throw new Error(text); results.push(text); };
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const key = (type, code) => document.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true }));
  const click = (selector) => document.querySelector(selector).click();
  const tap = (code) => { key('keydown', code); key('keyup', code); };
  app.ui.callbacks.onHome();
  click('[data-action="start"]');
  app.game.state.entities = [];
  await wait(150);
  assert(app.game.state.phase === 'playing' && app.game.state.distance > 0, '开始按钮进入可推进的游戏');
  key('keydown', 'ArrowRight');
  await wait(360);
  key('keyup', 'ArrowRight');
  assert(app.game.state.x > 2, '按住方向键可以连续转向');
  key('keydown', 'Space');
  await wait(25);
  key('keyup', 'Space');
  await wait(150);
  assert(app.game.state.y > 0.5, '点按空格触发跳跃');
  await wait(850);
  assert(app.game.state.y === 0, '跳跃后返回雪地');
  key('keydown', 'Space');
  await wait(740);
  key('keyup', 'Space');
  await wait(350);
  assert(app.game.state.flips >= 1 && app.game.state.y === 0, '长按跳跃可完成普通空翻并安全着陆');
  const energy = app.game.state.energy;
  key('keydown', 'ShiftLeft');
  await wait(200);
  assert(app.game.state.boosting && app.game.state.energy < energy, '冲刺键消耗能量并进入加速');
  key('keyup', 'ShiftLeft');
  tap('KeyP');
  const pausedDistance = app.game.state.distance;
  await wait(200);
  assert(app.game.state.phase === 'paused' && app.game.state.distance === pausedDistance, '暂停完全冻结游戏物理');
  click('[data-paused] [data-action="settings"]');
  assert(app.ui.modal === 'settings' && !document.querySelector('[data-settings]').hidden, '暂停时可以打开设置');
  click('[data-quality="low"]');
  assert(app.world.quality === 'low' && app.getSave().quality === 'low', '画质设置同时应用并保存');
  click('[data-quality="high"]');
  tap('Escape');
  assert(app.ui.modal === null && app.game.state.phase === 'paused', 'Escape 关闭设置后仍保持暂停');
  tap('KeyP');
  await wait(100);
  assert(app.game.state.phase === 'playing' && app.game.state.distance > pausedDistance, '暂停后可以恢复滑行');
  app.game.state.y = 0; app.game.state.vy = 0; app.game.state.rotation = 0;
  app.game.state.invincible = 0; app.game.state.shield = 0; app.game.state.penguin = 0;
  const crashes = app.game.state.crashes;
  app.game.state.entities = [{ id: 'browser-rock', type: 'rock', x: app.game.state.x, d: app.game.state.distance + 2 }];
  await wait(200);
  assert(app.game.state.crashes === crashes + 1 && app.game.state.recovering > 0, '实际帧循环中的障碍碰撞与摔倒恢复生效');
  click('[data-playing] [data-action="help"]');
  assert(app.game.state.phase === 'paused' && app.ui.modal === 'help', '游玩中查看帮助会先暂停');
  tap('Escape'); tap('KeyP');
  const beforeRuns = app.getSave().runs;
  app.game.state.avalanche = 0.001;
  await wait(120);
  assert(app.game.state.phase === 'over' && !document.querySelector('[data-over]').hidden, '雪崩追上后显示完整结算');
  assert(app.getSave().runs === beforeRuns + 1, '结算恰好保存一次本局纪录');
  click('[data-over] [data-action="restart"]');
  assert(app.game.state.phase === 'playing' && app.game.state.distance < 1 && app.game.state.coins === 0, '再来一趟重置本局并立刻可玩');
  assert(app.getSave().runs === beforeRuns + 1, '重开不会重复结算上一局');
  await wait(100);
  for (const entity of app.game.state.entities) {
    const mesh = app.world.entityMeshes.get(entity.id);
    if (mesh && mesh.userData.entityType !== entity.type) throw new Error('实体类型与可见模型不一致');
  }
  results.push('重开后的可见障碍与碰撞类型一致');
  tap('KeyP');
  const frames = [];
  let previous = performance.now();
  const start = previous;
  await new Promise(resolve => {
    function frame(now) {
      frames.push(now - previous); previous = now;
      if (now - start < 1500) requestAnimationFrame(frame); else resolve();
    }
    requestAnimationFrame(frame);
  });
  return JSON.stringify({ passed: results.length, results, averageFrameMs: +(frames.reduce((a,b)=>a+b,0)/frames.length).toFixed(2), renderer: app.world.renderer.info.render });
})()`;

const payload = Buffer.from(script, 'utf8').toString('base64');
const output = execSync(`agent-browser --session powder eval -b ${payload}`, { encoding: 'utf8', maxBuffer: 1024 * 1024 });
const result = JSON.parse(JSON.parse(output.trim()));
mkdirSync('artifacts', { recursive: true });
writeFileSync('artifacts/browser-smoke.json', JSON.stringify(result, null, 2), 'utf8');
console.log(JSON.stringify(result, null, 2));
