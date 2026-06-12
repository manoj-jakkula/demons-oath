// ============================================================================
// Audio — everything synthesized with the Web Audio API. No external files.
// ============================================================================

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.7;
    this.droneNodes = null;
    this.bossLayer = null;
    this._noiseBuf = null;
  }

  // must be called from a user gesture
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    // shared 1s noise buffer
    const len = this.ctx.sampleRate;
    this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this._noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startDrone();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  _env(gainNode, t0, peak, attack, decay) {
    const g = gainNode.gain;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(Math.max(peak, 0.0001), t0 + attack);
    g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  _osc(type, f0, f1, dur, peak, attack = 0.005) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    this._env(g, t, peak, attack, dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + attack + 0.05);
  }

  _noise(dur, peak, filterType = 'bandpass', f0 = 1000, f1 = null, q = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf; src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur);
    const g = this.ctx.createGain();
    this._env(g, t, peak, 0.004, dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t); src.stop(t + dur + 0.05);
  }

  // ---- one-shots -----------------------------------------------------------
  swing()      { this._noise(0.16, 0.16, 'bandpass', 2400, 500, 1.6); }
  swingHeavy() { this._noise(0.3, 0.22, 'bandpass', 1500, 220, 1.2); }
  impact(heavy = false) {
    this._noise(heavy ? 0.22 : 0.12, heavy ? 0.4 : 0.28, 'lowpass', heavy ? 900 : 1400);
    this._osc('sine', heavy ? 95 : 130, 40, heavy ? 0.22 : 0.13, heavy ? 0.5 : 0.32);
  }
  crit() { this.impact(true); this._osc('square', 880, 440, 0.12, 0.08); }
  parry() {
    if (!this.ctx) return;
    [1860, 2794, 1244, 740].forEach((f, i) =>
      this._osc('triangle', f, f * 0.99, 0.34 - i * 0.05, 0.16 - i * 0.03, 0.002));
    this._noise(0.08, 0.2, 'highpass', 3000);
  }
  block() { this._noise(0.1, 0.2, 'bandpass', 700, 300, 2); this._osc('sine', 160, 70, 0.1, 0.2); }
  dodge() { this._noise(0.22, 0.1, 'bandpass', 900, 2200, 0.8); }
  hurt()  { this._osc('sawtooth', 220, 90, 0.18, 0.2); this._noise(0.12, 0.18, 'lowpass', 800); }
  growl(pitch = 1) {
    this._osc('sawtooth', 85 * pitch, 55 * pitch, 0.45, 0.14, 0.05);
    this._noise(0.4, 0.07, 'lowpass', 400 * pitch);
  }
  shriek() { this._osc('sawtooth', 900, 1900, 0.5, 0.1, 0.03); this._noise(0.5, 0.1, 'highpass', 2400); }
  cast()   { this._osc('sine', 300, 900, 0.35, 0.12); this._noise(0.3, 0.06, 'bandpass', 2000, 4000); }
  teleport(){ this._osc('sine', 1200, 200, 0.3, 0.12); }
  death()  { this._osc('sawtooth', 140, 35, 0.6, 0.2, 0.02); this._noise(0.5, 0.2, 'lowpass', 600, 100); }
  bigDeath() {
    this._osc('sawtooth', 90, 25, 1.4, 0.4, 0.02);
    this._noise(1.2, 0.4, 'lowpass', 1400, 60);
    this._osc('sine', 50, 20, 1.5, 0.5);
  }
  rage() {
    this._osc('sawtooth', 60, 220, 0.7, 0.3, 0.02);
    this._noise(0.8, 0.35, 'lowpass', 3000, 200);
  }
  finisher() { this.impact(true); this._osc('triangle', 520, 130, 0.5, 0.25, 0.01); }
  pickup(rarity = 0) {
    if (!this.ctx) return;
    const base = [523, 659, 784, 1047];
    for (let i = 0; i <= Math.min(rarity + 1, 3); i++)
      setTimeout(() => this._osc('triangle', base[i], base[i], 0.25, 0.12, 0.005), i * 80);
  }
  gold()    { this._osc('triangle', 1320, 1180, 0.09, 0.08, 0.002); }
  potion()  { this._osc('sine', 392, 784, 0.3, 0.14); }
  levelup() { [392, 494, 587, 784].forEach((f, i) => setTimeout(() => this._osc('triangle', f, f, 0.4, 0.14), i * 110)); }
  uiClick() { this._osc('triangle', 700, 600, 0.06, 0.07, 0.002); }
  chestOpen(){ this._noise(0.4, 0.15, 'lowpass', 500); this.pickup(2); }
  waveHorn(){ this._osc('sawtooth', 110, 108, 1.0, 0.13, 0.15); this._osc('sawtooth', 165, 163, 1.0, 0.09, 0.15); }
  stagger() { this._osc('square', 240, 80, 0.2, 0.14); }

  // ---- ambient drone + boss layer -----------------------------------------
  startDrone() {
    if (!this.ctx || this.droneNodes) return;
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain(); g.gain.value = 0.045;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220;
    const o1 = this.ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 55;
    const o2 = this.ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 55.7;
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lfoG = this.ctx.createGain(); lfoG.gain.value = 0.02;
    lfo.connect(lfoG).connect(g.gain);
    o1.connect(f); o2.connect(f); f.connect(g).connect(this.master);
    o1.start(t); o2.start(t); lfo.start(t);
    this.droneNodes = { g, o1, o2, lfo };
  }

  setBossMusic(on) {
    if (!this.ctx) return;
    if (on && !this.bossLayer) {
      const g = this.ctx.createGain(); g.gain.value = 0;
      g.gain.setTargetAtTime(0.05, this.ctx.currentTime, 1.2);
      const o = this.ctx.createOscillator(); o.type = 'square'; o.frequency.value = 110;
      const o2 = this.ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 36.7;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
      const lfo = this.ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 2.2;
      const lfoG = this.ctx.createGain(); lfoG.gain.value = 0.03;
      lfo.connect(lfoG).connect(g.gain);
      o.connect(f); o2.connect(f); f.connect(g).connect(this.master);
      o.start(); o2.start(); lfo.start();
      this.bossLayer = { g, o, o2, lfo };
    } else if (!on && this.bossLayer) {
      const b = this.bossLayer; this.bossLayer = null;
      b.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.8);
      setTimeout(() => { try { b.o.stop(); b.o2.stop(); b.lfo.stop(); } catch (e) {} }, 2500);
    }
  }
}
