export class GameAudio {
  constructor(enabled = true) {
    this.enabled = enabled;
    this.ctx = null;
  }

  async unlock() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 0.3 : 0;
      this.master.connect(this.ctx.destination);
      // 循环噪声经过低通，模拟滑雪板掠过粉雪的声音。
      const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 600;
      this.wind = this.ctx.createGain();
      this.wind.gain.value = 0;
      noise.connect(filter).connect(this.wind).connect(this.master);
      noise.start();
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (this.ctx) this.master.gain.setTargetAtTime(enabled ? 0.3 : 0, this.ctx.currentTime, 0.08);
  }

  tone(frequency, duration = 0.15, type = 'sine', volume = 0.2, delay = 0) {
    if (!this.ctx || !this.enabled) return;
    const time = this.ctx.currentTime + delay;
    const oscillator = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, time);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.02);
  }

  play(type, turns = 1) {
    if (type === 'coin') { this.tone(1046, 0.09, 'sine', 0.22); this.tone(1568, 0.15, 'sine', 0.14, 0.04); }
    if (type === 'jump' || type === 'ramp' || type === 'terrain') { this.tone(330, 0.12, 'triangle'); this.tone(495, 0.15, 'sine', 0.13, 0.07); }
    if (type === 'airturn') {
      const note = 523 * 2 ** (Math.min(10, turns) / 12);
      this.tone(note, 0.13, 'triangle', 0.16);
      this.tone(note * 1.5, 0.18, 'sine', 0.1, 0.05);
    }
    if (type === 'flip' || type === 'powerup') [523, 659, 784, 1046].forEach((note, i) => this.tone(note, 0.18, 'triangle', 0.16, i * 0.065));
    if (type === 'crash') { this.tone(70, 0.3, 'sawtooth', 0.17); this.tone(49, 0.4, 'triangle', 0.2); }
    if (type === 'start') [392, 523, 784].forEach((note, i) => this.tone(note, 0.2, 'sine', 0.2, i * 0.09));
    if (type === 'gameover') [392, 330, 262].forEach((note, i) => this.tone(note, 0.3, 'triangle', 0.14, i * 0.15));
    if (type === 'boost') this.tone(196, 0.5, 'triangle', 0.17);
  }

  update(state) {
    if (!this.ctx) return;
    const volume = state.phase === 'playing' ? (0.07 + state.speed * 0.004) * (state.y > 0.3 ? 0.3 : 1) : 0;
    this.wind.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.12);
  }
}
