import { execSync } from 'node:child_process';

const mode = process.argv[2] || 'slope';
const source = `(async () => {
  const app = window.__POWDER__;
  app.ui.callbacks.onStart();
  const g = app.game;
  let maximum = 0;
  const flights = [];
  let flightStart = null;
  for (let i = 0; i < 6000; i++) {
    g.state.entities = [];
    g.update(1/90, {});
    maximum = Math.max(maximum, g.state.y);
    if (!g.state.grounded && flightStart === null) flightStart = g.state.distance;
    if (g.state.grounded && flightStart !== null) { flights.push({start:flightStart,end:g.state.distance,height:g.state.airHeightPeak,time:g.state.airTime}); flightStart = null; }
    if (${JSON.stringify(mode)} === 'slope' ? g.state.distance >= 118 : ${JSON.stringify(mode)} === 'air' ? g.state.y > 18 : g.state.distance >= 185) break;
  }
  if (${JSON.stringify(mode)} === 'crash') {
    g.state.airHeightPeak = 25;
    g.state.rotation = Math.PI;
    g._land();
  }
  g.pause(); app.ui.showScreen('playing');
  await new Promise(resolve => setTimeout(resolve, 1000));
  return JSON.stringify({distance:g.state.distance,y:g.state.y,maximum,flights,camera:app.world.camera.position,phase:g.state.phase,recovering:g.state.recovering});
})()`;
const payload = Buffer.from(source, 'utf8').toString('base64');
console.log(execSync(`agent-browser --session powder eval -b ${payload}`, { encoding: 'utf8' }));
execSync(`agent-browser --session powder screenshot artifacts/new-${mode}.png`, { stdio: 'inherit' });
