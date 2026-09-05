import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const run = command => execSync(`agent-browser --session powder ${command}`, { encoding: 'utf8' }).trim();
const evaluate = script => JSON.parse(JSON.parse(run(`eval -b ${Buffer.from(script, 'utf8').toString('base64')}`)));
const results = [];
const terrain = evaluate(`(async () => {
  const { game:g, ui, world } = window.__POWDER__;
  ui.callbacks.onStart();
  g._nextRow = g._nextObstacle = g._nextPowerup = g._nextRamp = 1e6;
  g.state.entities = [];
  let highest = 0, airtime = 0;
  for(let i=0;i<4000 && g.state.distance<310;i++) {
    g.update(1/120,{});
    highest=Math.max(highest,g.state.y); airtime=Math.max(airtime,g.state.airTime);
  }
  if(highest<20 || airtime<2.5) throw new Error('自然飞坡不够高：'+highest+'m / '+airtime+'s');
  if(g.state.crashes) throw new Error('未翻转也发生了摔倒');
  ui.callbacks.onStart();
  g._nextRow = g._nextObstacle = g._nextPowerup = g._nextRamp = 1e6;
  g.state.entities=[];
  for(let i=0;i<4000 && g.state.y<20;i++) g.update(1/120,{});
  g.pause();ui.showScreen('playing');
  await new Promise(r=>setTimeout(r,700));
  const THREE=await import('/node_modules/three/build/three.module.js');
  const center=world.player.position.clone().add(new THREE.Vector3(0,1.1,0)).project(world.camera);
  if(Math.abs(center.x)>.8 || Math.abs(center.y)>.85) throw new Error('高空角色离开画面：'+JSON.stringify(center));
  return JSON.stringify({highest,airtime,center,checks:['自然飞坡超过20米且腾空超过2.5秒','不做翻转的自然落地安全','高空镜头完整跟随角色']});
})()`);
results.push(...terrain.checks);
run('screenshot artifacts/air-height-verified.png');

const tricks = evaluate(`(async () => {
  const {game:g,ui}=window.__POWDER__;
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const key=(type,code)=>document.dispatchEvent(new KeyboardEvent(type,{code,bubbles:true,cancelable:true}));
  ui.callbacks.onResume();
  key('keydown','KeyW');key('keydown','KeyE');
  await wait(250);
  if(g.state.rotation>=0 || g.state.rollRotation<=0) throw new Error('前翻/右翻方向不正确');
  await wait(430);
  key('keyup','KeyW');key('keyup','KeyE');
  const deadline=performance.now()+5000;
  while(!g.state.grounded && performance.now()<deadline) await wait(20);
  if(g.state.flips<2 || g.state.recovering>0) throw new Error('组合翻转未成功兑现：'+JSON.stringify({flips:g.state.flips,recovery:g.state.recovering}));
  const scored=g.state.score;
  g.state.avalanche=80;
  Object.assign(g.state,{grounded:false,y:.02,vy:-40,rotation:Math.PI,rollRotation:0,airHeightPeak:30,airTime:2.8});
  await wait(100);
  if(g.state.crashTier!==4 || g.state.recovering<=3.5) throw new Error('高空摔倒档位错误');
  if(document.querySelector('[data-recovery]').hidden) throw new Error('未显示摔倒倒计时');
  const x=g.state.x, gap=g.state.avalanche;
  key('keydown','ArrowRight');key('keydown','Space');key('keydown','ShiftLeft');
  await wait(250);
  if(g.state.x!==x || g.state.boosting || g.state.y!==0) throw new Error('摔倒时仍能操作');
  if(g.state.avalanche>=gap-2) throw new Error('恢复期雪崩没有持续追近');
  key('keyup','ArrowRight');key('keyup','Space');key('keyup','ShiftLeft');
  ui.callbacks.onPause();
  const remaining=g.state.recovering;
  await wait(150);
  if(g.state.recovering!==remaining) throw new Error('暂停未冻结恢复时间');
  ui.showScreen('playing');
  return JSON.stringify({score:scored,remaining,gap:g.state.avalanche,checks:['W与E可同时完成前翻和右滚转','混合技巧稳落后兑现得分','30米失稳触发4秒高空重摔','趴地期间转向跳跃冲刺被锁定','趴地时雪崩持续追近','暂停冻结摔倒时间']});
})()`);
results.push(...tricks.checks);
run('screenshot artifacts/air-crash-verified.png');

const recovery = evaluate(`(async () => {
  const {game:g,ui,world}=window.__POWDER__;
  ui.callbacks.onResume();
  const deadline=performance.now()+5000;
  while(g.state.recovering>0 && performance.now()<deadline) await new Promise(r=>setTimeout(r,25));
  if(g.state.recovering || g.state.phase!=='playing') throw new Error('未能恢复游玩');
  if(g.state.invincible<=0) throw new Error('起身缺少恢复保护');
  const x=g.state.x;
  document.dispatchEvent(new KeyboardEvent('keydown',{code:'ArrowRight',bubbles:true}));
  await new Promise(r=>setTimeout(r,250));
  document.dispatchEvent(new KeyboardEvent('keyup',{code:'ArrowRight',bubbles:true}));
  if(g.state.x<=x+1) throw new Error('起身后没有恢复转向');
  ui.callbacks.onPause();
  return JSON.stringify({checks:['摔倒倒计时结束后可以继续滑行','起身有短暂无敌保护且恢复操作'],drawCalls:world.renderer.info.render.calls});
})()`);
results.push(...recovery.checks);
const report={passed:results.length,terrain,tricks,recovery,results};
writeFileSync('artifacts/air-smoke.json',JSON.stringify(report,null,2),'utf8');
console.log(JSON.stringify(report,null,2));
