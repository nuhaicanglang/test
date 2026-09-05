import { terrainFeature } from './terrain.js';

const icons = {
  mountain: '<path d="m2 19 7-13 5 8 4-7 8 12H2Z"/><path d="m6 12 3 2 3-3m4 1 2 2 3-2"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  sound: '<path d="m11 5-5 4H3v6h3l5 4V5Zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute: '<path d="m11 5-5 4H3v6h3l5 4V5Zm5 4 6 6m0-6-6 6"/>',
  settings: '<path d="m10 3-.7 3-2 .9-2.8-.9-2 3.4 2.2 2.1v2.3L2.5 16l2 3.4 2.8-.9 2 .9.7 2.6h4l.7-2.6 2-.9 2.8.9 2-3.4-2.2-2.2v-2.3l2.2-2.1-2-3.4-2.8.9-2-.9L14 3h-4Z"/><circle cx="12" cy="12.5" r="3"/>',
  fullscreen: '<path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="m8 4 12 8-12 8V4Z"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"/>',
  pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
  trophy: '<path d="M8 3h8v6a4 4 0 0 1-8 0V3Zm0 2H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4m-4 2v6m-4 2h8"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="m12 7 3 5-3 5-3-5 3-5Z"/>',
  wind: '<path d="M3 8h13a3 3 0 1 0-3-3M2 12h17a3 3 0 1 1-3 3M4 17h5"/>',
  jump: '<path d="M12 20V4m-6 6 6-6 6 6M5 20h14"/>',
  boost: '<path d="m14 2-9 12h6l-1 8 9-12h-6l1-8Z"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  magnet: '<path d="M5 3v10a7 7 0 0 0 14 0V3h-5v10a2 2 0 0 1-4 0V3H5Zm0 5h5m4 0h5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 4v3"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3h.01"/>',
  home: '<path d="m3 10 9-7 9 7m-16-1v12h5v-7h4v7h5V9"/>',
  replay: '<path d="M3 11a9 9 0 1 1 3 8M3 4v7h7"/>',
};

const icon = (name, extra = '') => `<svg viewBox="0 0 ${name === 'mountain' ? 28 : 24} 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${icons[name] || icons.mountain}</svg>`;
const number = (value) => Math.max(0, Math.floor(Number(value) || 0)).toLocaleString('en-US');
const bounded = (value, max = 100) => Math.min(max, Math.max(0, Number(value) || 0));

export class GameUI {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.screen = 'menu';
    this.modal = null;
    this.loaded = false;
    this.touchRollMode = false;
    this.touchPresses = new Map();
    this.save = { bestDistance: 0, bestScore: 0, totalCoins: 0, runs: 0, skin: 'orange', sound: true, quality: 'high' };
    this.root = document.querySelector('#ui');
    if (!this.root) throw new Error('GameUI requires #ui');
    this.root.innerHTML = this.template();
    this.bindEvents();
    this.showScreen('menu');
    this.setLoading(false);
  }

  template() {
    return `
      <div class="menu-vignette" aria-hidden="true"></div>
      <header class="masthead" data-menu>
        <a class="brand" href="#" aria-label="POWDER 雪境大冒险首页" data-action="home">
          <span class="brand-icon">${icon('mountain')}</span>
          <span class="brand-wordmark">POWDER<span class="brand-caption">雪境大冒险</span></span>
        </a>
        <div class="header-tools">
          <span class="edition">THE MOUNTAINS ARE CALLING</span>
          <button class="icon-button sound-button" data-action="sound" aria-label="关闭音效" aria-pressed="true">${icon('sound')}</button>
          <button class="icon-button" data-action="settings" aria-label="打开设置">${icon('settings')}</button>
          <button class="icon-button fullscreen-button" data-action="fullscreen" aria-label="切换全屏">${icon('fullscreen')}</button>
        </div>
      </header>

      <main class="menu-content" data-menu aria-label="游戏首页">
        <div class="hero-eyebrow"><span></span> 3D ALPINE ADVENTURE</div>
        <h1>向雪山，<br><span>出发。</span><span class="title-spark" aria-hidden="true">✳</span></h1>
        <p class="hero-description">把日常留在山下。<br>冲下陡坡，翻越山谷，稳稳落地兑现精彩。</p>
        <button class="primary-button start-button" data-action="start" aria-label="开始滑雪冒险"><span data-start-label>正在准备雪道</span><span class="button-arrow">${icon('arrow')}</span></button>
        <button class="text-button help-button" data-action="help" aria-label="查看玩法指南">${icon('help')}<span>玩法指南</span><span class="help-key">H</span></button>
      </main>

      <aside class="trail-card" data-menu aria-label="当前雪道 晨曦雪谷">
        <div class="trail-top"><span class="trail-index">01 <span>/</span></span><span class="trail-open"><i></i> 雪道已开放</span></div>
        <div class="trail-body"><div><p class="micro-label">YOUR NEXT ADVENTURE</p><h2>晨曦雪谷</h2><p class="trail-subtitle">DAWN VALLEY</p></div><div class="trail-outline" aria-hidden="true">${icon('mountain')}</div></div>
        <div class="trail-bottom"><span>无尽雪道 <span class="trail-separator">·</span> 自由滑行</span><span class="difficulty"><i></i><i></i><i></i><i></i><i></i> 进阶</span></div>
      </aside>

      <footer class="menu-footer" data-menu>
        <div class="weather-info"><span>${icon('pin')}阿尔卑斯 · 2,840 m</span><span class="weather-divider"></span><span>${icon('sun')} −8° <span class="weather-word">粉雪晴日</span></span></div>
        <div class="keyboard-hint"><span><kbd>←</kbd><kbd>→</kbd> 转向</span><span><kbd>SPACE</kbd> 跳跃</span><span><kbd>W S</kbd><kbd>Q E</kbd> 翻转</span><span><kbd>SHIFT</kbd> 冲刺</span></div>
        <div class="best-record">${icon('trophy')}<span>最佳距离</span><strong data-best-distance>0</strong><span>m</span></div>
      </footer>

      <section class="game-hud" data-playing hidden aria-label="滑雪状态">
        <div class="hud-stats"><div class="distance-stat"><span class="micro-label">DISTANCE / 滑行距离</span><div><strong data-distance>0</strong><span>m</span></div></div><div class="coins-stat">${icon('coin')}<strong data-coins>0</strong></div></div>
        <div class="avalanche-meter"><div class="avalanche-label"><span>${icon('wind')}<span data-avalanche-label>雪崩距离</span></span><strong><span data-avalanche>100</span> m</strong></div><div class="avalanche-track"><span data-avalanche-bar></span></div><p data-avalanche-status>保持速度，享受粉雪</p></div>
        <div class="hud-tools"><button class="icon-button game-help" data-action="help" aria-label="查看玩法指南">${icon('help')}</button><button class="icon-button pause-button" data-action="pause" aria-label="暂停游戏">${icon('pause')}</button></div>
        <div class="terrain-preview" data-terrain-preview><span>${icon('mountain')}<span data-terrain-label>前方飞坡</span></span><strong><span data-terrain-distance>0</span> m</strong><small>加速冲坡</small></div>
        <aside class="air-trick" data-air-trick hidden aria-label="空中技巧"><div class="air-trick-heading"><span data-takeoff-label>自由腾空</span><span><strong data-air-height>0.0</strong> m <i>·</i> <strong data-air-time>0.0</strong> s</span></div><div class="air-trick-main"><strong class="air-turns" data-air-turns>0<span>×</span></strong><div><span class="air-combo-label" data-air-combo>空中姿态</span><p><strong data-air-score>+0</strong><span>落地兑现</span></p></div></div><div class="air-trick-footer"><span>前后 <b data-pitch-turns>0</b> <i>·</i> 左右 <b data-roll-turns>0</b> 圈</span><span>松键回正，稳稳着陆</span></div></aside>
        <aside class="recovery-hud" data-recovery hidden aria-label="摔倒恢复状态"><div class="recovery-heading"><span class="recovery-icon">${icon('shield')}</span><div><span class="recovery-eyebrow">正在重新站起</span><h3 data-recovery-tier aria-live="polite">轻摔</h3></div><strong class="recovery-time"><span data-recovery-time>1.0</span><small>s</small></strong></div><div class="recovery-track" role="progressbar" aria-label="恢复进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span data-recovery-bar></span></div><p class="recovery-details"><span>最高离地 <strong data-crash-height>0.0</strong> m</span><span>无法操作，雪崩逼近中</span></p></aside>
        <div class="speed-meter"><span class="micro-label">CURRENT SPEED</span><div class="speed-number"><strong data-speed>0</strong><span>km/h</span></div><div class="energy-label"><span>${icon('boost')} 冲刺能量</span><span data-energy-label>100%</span></div><div class="energy-track"><span data-energy-bar></span></div><span class="boost-key"><kbd>SHIFT</kbd> 按住冲刺</span></div>
        <div class="powerups" data-powerups aria-label="当前道具"></div>
        <aside class="mission-panel"><button class="mission-heading" data-action="missions" aria-label="收起本次挑战" aria-expanded="true"><span>本次挑战 <span class="mission-count" data-mission-count>0 / 3</span></span>${icon('chevron')}</button><div class="mission-list"><div data-mission="distance"><span class="mission-check"></span><span>滑行 500 米</span><small data-mission-distance>0 / 500</small></div><div data-mission="coins"><span class="mission-check"></span><span>收集 20 金币</span><small data-mission-coins>0 / 20</small></div><div data-mission="flips"><span class="mission-check"></span><span>成功翻转 3 圈</span><small data-mission-flips>0 / 3</small></div></div></aside>
        <div class="touch-controls" aria-label="触屏滑雪控制"><div class="touch-steering"><button class="touch-mode" data-action="roll-mode" aria-label="切换为左右翻滚" aria-pressed="false"><span data-mode-steer>转向</span><span data-mode-roll>翻滚</span></button><button data-touch="left" aria-label="向左滑行">${icon('arrow')}<span data-steer-label="left">左移</span></button><button data-touch="right" aria-label="向右滑行">${icon('arrow')}<span data-steer-label="right">右移</span></button></div><div class="touch-actions"><button class="touch-frontflip" data-touch="frontflip" aria-label="按住前空翻">${icon('replay')}<span>前翻</span></button><button data-touch="boost" aria-label="按住冲刺">${icon('boost')}<span>冲刺</span></button><button data-touch="jump" aria-label="点按跳跃，长按后空翻">${icon('jump')}<span>跳跃 / 后翻</span></button></div></div>
      </section>

      <section class="screen-overlay pause-overlay" data-paused hidden aria-label="游戏已暂停"><div class="pause-panel surface-panel"><span class="panel-eyebrow">TAKE A BREATHER</span><h2>山就在这里。</h2><p>歇一会儿，再继续向前。</p><button class="primary-button" data-action="resume" aria-label="继续冒险"><span>继续冒险</span>${icon('play')}</button><div class="pause-options"><button class="text-button" data-action="restart" aria-label="重新开始">${icon('replay')}重新开始</button><button class="text-button" data-action="settings" aria-label="打开设置">${icon('settings')}设置</button><button class="text-button" data-action="home" aria-label="返回首页">${icon('home')}首页</button></div><span class="pause-key">按 <kbd>ESC</kbd> 或 <kbd>P</kbd> 继续</span></div></section>

      <section class="screen-overlay results-overlay" data-over hidden aria-label="本次冒险结算"><div class="results-panel surface-panel"><span class="panel-eyebrow">UNTIL THE NEXT RUN</span><div class="result-badge" data-result-badge>${icon('mountain')} 每一程，都是新风景</div><h2>这趟，够尽兴。</h2><p class="result-reason" data-result-reason>抖落雪花，再向远方出发。</p><div class="result-distance"><strong data-result-distance>0</strong><span>m</span><small>本次滑行距离</small></div><div class="result-stats"><div>${icon('coin')}<strong data-result-coins>0</strong><span>收集金币</span></div><div>${icon('replay')}<strong data-result-flips>0</strong><span>成功翻转</span></div><div>${icon('trophy')}<strong data-result-score>0</strong><span>冒险得分</span></div></div><div class="result-best"><span>个人最佳距离</span><strong><span data-result-best>0</span> m</strong></div><button class="primary-button" data-action="restart" aria-label="再来一趟"><span>再来一趟</span>${icon('arrow')}</button><button class="text-button result-home" data-action="home" aria-label="返回首页">返回首页</button></div></section>

      <div class="modal-backdrop" data-modal-backdrop hidden>
        <section class="modal surface-panel help-modal" data-help hidden role="dialog" aria-modal="true" aria-labelledby="help-title"><button class="icon-button modal-close" data-action="close-modal" aria-label="关闭玩法指南">${icon('close')}</button><span class="panel-eyebrow">A LITTLE GUIDE</span><h2 id="help-title">你的第一道雪痕。</h2><p class="modal-intro">冲下陡坡，飞越山谷。每一圈精彩，都要稳稳落地。</p><div class="guide-list"><div><span class="guide-key"><kbd>A</kbd><kbd>D</kbd><small>或 ← →</small></span><div><h3>划出你的路线</h3><p>在雪面与空中左右移动，避开松树、岩石和横木。</p></div></div><div><span class="guide-key"><kbd>SPACE</kbd><small>或 ↑</small></span><div><h3>借陡坡一跃而起</h3><p>点按跳跃。加速冲过陡坡和坡顶，获得更高、更久的腾空。</p></div></div><div><span class="guide-key"><kbd>W</kbd><kbd>S</kbd><small>前翻 / 后翻</small></span><div><h3>把天空转三圈、四圈</h3><p>空中按 W 前空翻，S 后空翻；长按空格或 F 也能后翻。连续整圈叠加得分。</p></div></div><div><span class="guide-key"><kbd>Q</kbd><kbd>E</kbd><small>左翻 / 右翻</small></span><div><h3>两种旋转，一起挑战</h3><p>Q / E 左右滚转，可与 W / S 同按。松开旋转键自动回正，请留出着陆时间，稳稳落地后才兑现分数。</p></div></div><div><span class="guide-key"><kbd>SHIFT</kbd></span><div><h3>甩开身后的雪崩</h3><p>按住冲刺消耗能量，松开恢复。失稳摔倒后无法转向或冲刺，雪崩仍会逼近。</p></div></div></div><div class="landing-guide"><h3>飞得高没关系，失稳才会摔倒</h3><p>摔倒后按本次最高离地高度恢复，越高就趴得越久。</p><div class="recovery-tiers"><span><b>轻摔</b><small>低于 4 m</small><strong>1 s</strong></span><span><b>重摔</b><small>4 至 10 m</small><strong>1.8 s</strong></span><span><b>严重摔倒</b><small>10 至 20 m</small><strong>2.8 s</strong></span><span><b>高空重摔</b><small>20 m 及以上</small><strong>4 s</strong></span></div></div><p class="touch-guide">手机：切换「转向 / 翻滚」后，左右按钮控制横移或滚转；「前翻」按住前空翻，「跳跃」点按起跳、长按后空翻。</p><div class="guide-bottom"><span><kbd>ESC</kbd> / <kbd>P</kbd> 暂停</span><span>松开旋转键，提前回正</span></div><button class="primary-button" data-action="close-modal" aria-label="知道了，关闭玩法指南"><span>去留下一道雪痕</span>${icon('arrow')}</button></section>
        <section class="modal surface-panel settings-modal" data-settings hidden role="dialog" aria-modal="true" aria-labelledby="settings-title"><button class="icon-button modal-close" data-action="close-modal" aria-label="关闭设置">${icon('close')}</button><span class="panel-eyebrow">MAKE IT YOURS</span><h2 id="settings-title">出发前的小准备。</h2><div class="setting-row"><div><h3>山间音效</h3><p>听见滑雪、风声与每一次腾空</p></div><button class="toggle-button" data-action="sound" role="switch" aria-checked="true" aria-label="开启或关闭山间音效"><span></span></button></div><div class="setting-row"><div><h3>画面质量</h3><p>根据设备，选择合适的雪景</p></div><div class="segmented" aria-label="画面质量"><button data-quality="high" aria-label="精细画质" aria-pressed="true">精细</button><button data-quality="low" aria-label="流畅画质" aria-pressed="false">流畅</button></div></div><div class="outfit-title"><div><h3>今天穿什么</h3><p>累计金币，解锁新的山间配色</p></div><span class="wallet">${icon('coin')}<strong data-wallet>0</strong></span></div><div class="outfit-grid">${this.outfit('orange', '日出橙', 0)}${this.outfit('blue', '冰川蓝', 100)}${this.outfit('violet', '暮光紫', 300)}</div><p class="settings-note">纪录与装扮会自动保存在这台设备上。</p></section>
      </div>
      <div class="toast-stack" aria-live="polite" aria-atomic="true"></div>`;
  }

  outfit(id, name, price) {
    return `<button class="outfit-button" data-skin="${id}" aria-label="选择${name}${price ? `，累计 ${price} 金币解锁` : ''}" aria-pressed="${id === 'orange'}"><span class="jacket jacket-${id}" aria-hidden="true"><i></i></span><strong>${name}</strong><small data-skin-status="${id}">${price ? `${price} 金币解锁` : '已选择'}</small><span class="outfit-check">${icon('check')}</span></button>`;
  }

  bindEvents() {
    this.root.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action], [data-quality], [data-skin]');
      if (!button || button.disabled) return;
      event.preventDefault();
      if (button.dataset.quality) { this.setQuality(button.dataset.quality); this.callbacks.onQuality?.(button.dataset.quality); return; }
      if (button.dataset.skin) { this.setSkin(button.dataset.skin); this.callbacks.onSkin?.(button.dataset.skin); return; }
      const actions = {
        start: () => { this.setTouchRollMode(false); this.closeModal(); this.callbacks.onStart?.(); },
        pause: () => this.callbacks.onPause?.(),
        resume: () => this.callbacks.onResume?.(),
        restart: () => { this.setTouchRollMode(false); this.closeModal(); this.callbacks.onRestart?.(); },
        home: () => { this.closeModal(); this.callbacks.onHome?.(); },
        settings: () => { this.callbacks.onSettings?.(); this.showSettings(); },
        sound: () => { const enabled = !this.save.sound; this.setSound(enabled); this.callbacks.onSound?.(enabled); },
        fullscreen: () => this.callbacks.onFullscreen?.(),
        help: () => { if (this.screen === 'playing') this.callbacks.onPause?.(); this.showHelp(); },
        'close-modal': () => this.closeModal(),
        'roll-mode': () => this.setTouchRollMode(!this.touchRollMode),
        missions: () => { const expanded = button.getAttribute('aria-expanded') !== 'true'; button.setAttribute('aria-expanded', String(expanded)); button.setAttribute('aria-label', `${expanded ? '收起' : '展开'}本次挑战`); this.root.querySelector('.mission-panel').classList.toggle('collapsed', !expanded); },
      };
      actions[button.dataset.action]?.();
    });
    this.root.querySelector('[data-modal-backdrop]').addEventListener('click', (event) => {
      if (event.target.matches('[data-modal-backdrop]')) this.closeModal();
    });
    document.addEventListener('keydown', (event) => {
      if (this.modal) {
        if (event.code === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); this.closeModal(); }
        if (event.code === 'Tab') {
          const focusable = [...this.root.querySelector(`[data-${this.modal}]`).querySelectorAll('button:not(:disabled), a[href], [tabindex="0"]')];
          const first = focusable[0]; const last = focusable.at(-1);
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
        if (event.code !== 'Tab') event.stopPropagation();
      } else if (event.code === 'KeyH' && !event.repeat && this.screen !== 'over') {
        if (this.screen === 'playing') this.callbacks.onPause?.();
        this.showHelp();
      }
    }, true);
    this.root.querySelectorAll('[data-touch]').forEach((button) => {
      const release = (event) => {
        event.preventDefault();
        const press = this.touchPresses.get(event.pointerId);
        if (!press || press.button !== button) return;
        this.touchPresses.delete(event.pointerId);
        if (![...this.touchPresses.values()].some((active) => active.button === button)) button.classList.remove('pressed');
        if (![...this.touchPresses.values()].some((active) => active.action === press.action)) this.callbacks.onTouch?.(press.action, false);
      };
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        if (this.screen !== 'playing' || this.modal || button.disabled) return;
        const direction = button.dataset.touch;
        const action = this.touchRollMode && ['left', 'right'].includes(direction) ? `roll-${direction}` : direction;
        const alreadyPressed = [...this.touchPresses.values()].some((active) => active.action === action);
        // 每个手指记住按下时的动作，切换模式或取消触摸时也按原动作释放。
        this.touchPresses.set(event.pointerId, { button, action });
        button.setPointerCapture(event.pointerId);
        button.classList.add('pressed');
        if (!alreadyPressed) this.callbacks.onTouch?.(action, true);
      });
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', release);
    });
  }

  clearTouchControls() {
    const presses = [...this.touchPresses.entries()];
    this.touchPresses.clear();
    new Set(presses.map(([, press]) => press.action)).forEach((action) => this.callbacks.onTouch?.(action, false));
    presses.forEach(([pointerId, { button }]) => {
      if (button.hasPointerCapture(pointerId)) button.releasePointerCapture(pointerId);
    });
    this.root.querySelectorAll('[data-touch]').forEach((button) => button.classList.remove('pressed'));
  }

  setTouchRollMode(enabled) {
    this.clearTouchControls();
    this.touchRollMode = !!enabled;
    const modeButton = this.root.querySelector('[data-action="roll-mode"]');
    modeButton.setAttribute('aria-pressed', String(this.touchRollMode));
    modeButton.setAttribute('aria-label', this.touchRollMode ? '切换为左右转向' : '切换为左右翻滚');
    this.root.querySelector('.touch-controls').classList.toggle('roll-mode', this.touchRollMode);
    ['left', 'right'].forEach((direction) => {
      const label = direction === 'left' ? '左' : '右';
      this.write(`[data-steer-label="${direction}"]`, `${label}${this.touchRollMode ? '翻' : '移'}`);
      this.root.querySelector(`[data-touch="${direction}"]`).setAttribute('aria-label', this.touchRollMode ? `按住向${label}翻滚` : `向${label}滑行`);
    });
    this.callbacks.onTouch?.('roll-mode', this.touchRollMode);
  }

  showScreen(screen = 'menu') {
    const previousScreen = this.screen;
    this.screen = screen;
    this.root.dataset.screen = screen;
    for (const name of ['menu', 'playing', 'paused', 'over']) {
      this.root.querySelectorAll(`[data-${name}]`).forEach((element) => { element.hidden = name !== screen && !(name === 'playing' && screen === 'paused'); });
    }
    if (screen !== 'playing') this.clearTouchControls();
    if (screen === 'menu' || screen === 'over' || (screen === 'playing' && ['menu', 'over'].includes(previousScreen))) this.setTouchRollMode(false);
    if (screen === 'menu' || screen === 'playing' || screen === 'over') this.closeModal();
    if (screen === 'playing' && ['menu', 'over'].includes(previousScreen)) {
      const collapsed = window.innerWidth < 700;
      this.root.querySelector('.mission-panel').classList.toggle('collapsed', collapsed);
      const heading = this.root.querySelector('.mission-heading');
      heading.setAttribute('aria-expanded', String(!collapsed));
      heading.setAttribute('aria-label', `${collapsed ? '展开' : '收起'}本次挑战`);
    }
  }

  update(state = {}, save) {
    if (save) this.updateSave(save);
    this.write('[data-distance]', number(state.distance));
    this.write('[data-coins]', number(state.coins));
    this.write('[data-speed]', number((state.speed || 0) * 3.6));
    const energy = bounded(state.energy ?? 100);
    this.write('[data-energy-label]', `${Math.round(energy)}%`);
    this.root.querySelector('[data-energy-bar]').style.transform = `scaleX(${energy / 100})`;
    this.root.querySelector('.speed-meter').classList.toggle('is-boosting', !!state.boosting);
    const avalanche = bounded(state.avalanche ?? state.avalancheDistance ?? 100);
    this.write('[data-avalanche]', Math.round(avalanche));
    this.root.querySelector('[data-avalanche-bar]').style.transform = `scaleX(${avalanche / 100})`;
    this.root.querySelector('.avalanche-meter').classList.toggle('danger', avalanche < 30);
    this.write('[data-avalanche-status]', state.recovering > 0 ? '正在恢复，雪崩仍在逼近' : avalanche < 30 ? '雪崩正在靠近，快冲刺！' : avalanche < 55 ? '保持前进，拉开距离' : '保持速度，享受粉雪');
    this.updateAirTrick(state);
    this.updateRecovery(state);
    const feature = terrainFeature(Number(state.distance) || 0);
    const terrainPreview = this.root.querySelector('[data-terrain-preview]');
    terrainPreview.hidden = state.y > 0.08 || state.recovering > 0;
    this.write('[data-terrain-label]', feature.label);
    this.write('[data-terrain-distance]', Math.round(feature.nextCrestDistance));
    let complete = 0;
    [['distance', 500], ['coins', 20], ['flips', 3]].forEach(([key, goal]) => {
      const current = Math.min(goal, Math.floor(state[key] || 0));
      this.write(`[data-mission-${key}]`, `${current} / ${goal}`);
      const done = current >= goal;
      complete += Number(done);
      this.root.querySelector(`[data-mission="${key}"]`).classList.toggle('complete', done);
    });
    this.write('[data-mission-count]', `${complete} / 3`);
    // 使用稳定内容签名，避免每一帧重建道具节点。
    const powerups = [
      ['shield', 'shield', '雪光护盾'], ['magnet', 'magnet', '金币磁铁'], ['penguin', 'mountain', '企鹅伙伴'], ['boostTime', 'boost', '疾风加速'],
    ].filter(([key]) => Number(state[key]) > 0).map(([key, symbol, name]) => `<span class="powerup-badge">${icon(symbol)}${name}<strong>${Math.ceil(state[key])}s</strong></span>`).join('');
    if (powerups !== this.lastPowerups) { this.root.querySelector('[data-powerups]').innerHTML = powerups; this.lastPowerups = powerups; }
  }

  updateAirTrick(state) {
    const height = bounded(state.y, 999);
    const time = bounded(state.airTime, 999);
    const visible = height > 0.08 && time > 0 && !(state.recovering > 0);
    const panel = this.root.querySelector('[data-air-trick]');
    panel.hidden = !visible;
    if (!visible) return;
    const pitchTurns = Math.floor(Math.abs(Number(state.pitchTurns) || 0));
    const rollTurns = Math.floor(Math.abs(Number(state.rollTurns) || 0));
    const turns = Math.max(pitchTurns + rollTurns, Math.floor(Math.abs(Number(state.airTurns) || 0)));
    const takeoffLabels = { cliff: '峭壁飞跃', ramp: '跳台腾空', crest: '坡顶飞跃', terrain: '陡坡飞跃', jump: '自由腾空', slope: '陡坡腾空' };
    this.write('[data-takeoff-label]', takeoffLabels[state.takeoffType] || (state.airHeightPeak >= 10 ? '高空飞跃' : '自由腾空'));
    this.write('[data-air-height]', height.toFixed(1));
    this.write('[data-air-time]', time.toFixed(1));
    this.write('[data-air-turns]', `${turns}×`);
    this.write('[data-air-combo]', turns >= 4 ? '高空连翻' : turns >= 3 ? '三连翻！' : turns > 0 ? '连续翻转' : '空中姿态');
    this.write('[data-air-score]', `+${number(state.airScore)}`);
    this.write('[data-pitch-turns]', pitchTurns);
    this.write('[data-roll-turns]', rollTurns);
    panel.classList.toggle('is-combo', turns >= 3);
    panel.classList.toggle('is-epic', turns >= 4);
  }

  updateRecovery(state) {
    const remaining = bounded(state.recovering, 10);
    const recovering = remaining > 0;
    const panel = this.root.querySelector('[data-recovery]');
    panel.hidden = !recovering;
    if (recovering && !this.wasRecovering) this.clearTouchControls();
    this.wasRecovering = recovering;
    this.root.querySelector('.touch-controls').classList.toggle('is-recovering', recovering);
    this.root.querySelectorAll('[data-touch], [data-action="roll-mode"]').forEach((button) => { if (button.disabled !== recovering) button.disabled = recovering; });
    if (!recovering) return;
    const height = bounded(state.crashHeight, 999);
    const tier = Math.max(1, Math.floor(bounded(state.crashTier || (height >= 20 ? 4 : height >= 10 ? 3 : height >= 4 ? 2 : 1), 4)));
    const duration = Math.max(remaining, Number(state.recoveryTotal) || [0, 1, 1.8, 2.8, 4][tier]);
    const progress = bounded((1 - remaining / duration) * 100);
    panel.dataset.tier = String(tier);
    this.write('[data-recovery-tier]', ['轻摔', '重摔', '严重摔倒', '高空重摔'][tier - 1]);
    this.write('[data-crash-height]', height.toFixed(1));
    this.write('[data-recovery-time]', remaining.toFixed(1));
    this.root.querySelector('[data-recovery-bar]').style.transform = `scaleX(${progress / 100})`;
    this.root.querySelector('.recovery-track').setAttribute('aria-valuenow', String(Math.round(progress)));
  }

  updateSave(save = {}) {
    Object.assign(this.save, save);
    this.write('[data-best-distance]', number(this.save.bestDistance));
    this.write('[data-wallet]', number(this.save.totalCoins));
    this.setSound(this.save.sound !== false);
    this.setQuality(this.save.quality || 'high');
    this.setSkin(this.save.skin || 'orange');
  }

  showResults(state = {}, save = {}) {
    this.updateSave(save);
    this.write('[data-result-distance]', number(state.distance));
    this.write('[data-result-coins]', number(state.coins));
    this.write('[data-result-flips]', number(state.flips));
    this.write('[data-result-score]', number(state.score));
    this.write('[data-result-best]', number(this.save.bestDistance));
    const record = Boolean(state.newRecord);
    const badge = this.root.querySelector('[data-result-badge]');
    badge.innerHTML = `${icon(record ? 'trophy' : 'mountain')} ${record ? '新纪录，山也记得这一刻' : '每一程，都是新风景'}`;
    badge.classList.toggle('new-record', record);
    const reason = state.reason || state.deathReason || '';
    this.write('[data-result-reason]', /avalanche|雪崩/.test(reason) ? '雪崩先到了一步。下一次，再快一点。' : /crash|collision|撞/.test(reason) ? '雪道有点小意外，冒险还有下一回。' : '抖落雪花，再向远方出发。');
    this.showScreen('over');
  }

  setSound(enabled) {
    this.save.sound = !!enabled;
    const button = this.root.querySelector('.sound-button');
    if (button.dataset.enabled !== String(!!enabled)) { button.innerHTML = icon(enabled ? 'sound' : 'mute'); button.dataset.enabled = String(!!enabled); }
    button.setAttribute('aria-label', enabled ? '关闭音效' : '开启音效');
    button.setAttribute('aria-pressed', String(!!enabled));
    this.root.querySelector('.toggle-button').setAttribute('aria-checked', String(!!enabled));
  }

  setQuality(quality) {
    this.save.quality = quality;
    this.root.querySelectorAll('[data-quality]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.quality === quality)));
  }

  setSkin(id) {
    this.save.skin = id;
    this.root.querySelectorAll('[data-skin]').forEach((button) => {
      const skin = button.dataset.skin;
      const price = skin === 'blue' ? 100 : skin === 'violet' ? 300 : 0;
      const locked = this.save.totalCoins < price;
      button.disabled = locked;
      button.classList.toggle('locked', locked);
      button.setAttribute('aria-pressed', String(skin === id));
      this.write(`[data-skin-status="${skin}"]`, locked ? `${price} 金币解锁` : skin === id ? '已选择' : '已解锁');
    });
  }

  setLoading(loaded = true) {
    this.loaded = loaded;
    this.root.querySelector('.start-button').disabled = !loaded;
    this.write('[data-start-label]', loaded ? '开始冒险' : '正在准备雪道');
    this.root.classList.toggle('is-loading', !loaded);
  }

  showHelp() { this.openModal('help'); }
  hideHelp() { if (this.modal === 'help') this.closeModal(); }
  showSettings() { this.updateSave(this.save); this.openModal('settings'); }

  openModal(name) {
    if (!this.modal) this.previousFocus = document.activeElement;
    this.modal = name;
    this.root.querySelector('[data-modal-backdrop]').hidden = false;
    ['help', 'settings'].forEach((key) => { this.root.querySelector(`[data-${key}]`).hidden = key !== name; });
    this.root.querySelector(`[data-${name}] .modal-close`).focus({ preventScroll: true });
  }

  closeModal() {
    if (!this.modal) return;
    this.modal = null;
    this.root.querySelector('[data-modal-backdrop]').hidden = true;
    this.root.querySelector('[data-help]').hidden = true;
    this.root.querySelector('[data-settings]').hidden = true;
    if (this.previousFocus?.isConnected && !this.previousFocus.closest('[hidden]')) this.previousFocus.focus({ preventScroll: true });
  }

  showToast(text, kind = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${kind}`;
    toast.textContent = text;
    const stack = this.root.querySelector('.toast-stack');
    while (stack.children.length > 2) stack.firstElementChild.remove();
    stack.append(toast);
    setTimeout(() => { toast.classList.add('leaving'); setTimeout(() => toast.remove(), 250); }, 2800);
  }

  write(selector, value) {
    const element = this.root.querySelector(selector);
    const next = String(value);
    if (element && element.textContent !== next) element.textContent = next;
  }
}

export default GameUI;
