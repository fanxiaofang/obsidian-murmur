// src/audio/AudioEngine.ts — Summer Rain Night Soundscape (Web Audio API)

type Listener = (enabled: boolean) => void;

const RAIN_DURATION = 50;
const FADE_DURATION = 6;
const POST_RAIN_DURATION = 50;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private running = false;
  private volume = 0.3;
  private listeners = new Set<Listener>();
  private timers: ReturnType<typeof setTimeout>[] = [];
  private activeNodes: (AudioBufferSourceNode | OscillatorNode)[] = [];
  private rainGain: GainNode | null = null;
  private postGain: GainNode | null = null;
  private scenePhase: 'rain' | 'postRain' = 'rain';

  get isRunning() { return this.running; }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() { this.listeners.forEach(fn => fn(this.running)); }

  private later(fn: () => void, ms: number) {
    const id = setTimeout(() => { if (this.running) fn(); }, ms);
    this.timers.push(id);
    return id;
  }

  // ─── Buffers ───────────────────────────────────────────

  private noiseBuf(dur: number): AudioBuffer {
    const c = this.ctx!;
    const len = c.sampleRate * dur;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    // Brown noise (more natural for rain/water)
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      d[i] = last * 3.5;
    }
    return buf;
  }

  private whiteBuf(dur: number): AudioBuffer {
    const c = this.ctx!;
    const len = c.sampleRate * dur;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private pinkBuf(dur: number): AudioBuffer {
    const c = this.ctx!;
    const len = c.sampleRate * dur;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let b0=0, b1=0, b2=0, b3=0, b4=0, b5=0, b6=0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886*b0 + w*0.0555179;
      b1 = 0.99332*b1 + w*0.0750759;
      b2 = 0.96900*b2 + w*0.1538520;
      b3 = 0.86650*b3 + w*0.3104856;
      b4 = 0.55000*b4 + w*0.5329522;
      b5 = -0.7616*b5 - w*0.0168980;
      d[i] = (b0+b1+b2+b3+b4+b5+b6+w*0.5362) * 0.11;
      b6 = w * 0.115926;
    }
    return buf;
  }

  private track(n: AudioBufferSourceNode | OscillatorNode) { this.activeNodes.push(n); }

  // ─── Rain System ───────────────────────────────────────

  private startRain() {
    const c = this.ctx!;
    this.rainGain = c.createGain();
    this.rainGain.gain.value = 0;
    this.rainGain.connect(this.masterGain!);

    // Layer 1: Pink-noise base (steady rain ambience)
    this.rainLayer(this.pinkBuf(4), 200, 3500, 0.012);
    // Layer 2: Brown-noise low rumble (distant rain on ground)
    this.rainLayer(this.noiseBuf(4), 60, 400, 0.018);
    // Layer 3: White-noise high sizzle (rain on leaves/foliage)
    this.rainLayer(this.whiteBuf(3), 2500, 8000, 0.004);
    // Layer 4: Mid-range patter
    this.rainLayer(this.pinkBuf(3), 800, 2000, 0.007);

    // Fade in
    this.rainGain.gain.setValueAtTime(0, c.currentTime);
    this.rainGain.gain.linearRampToValueAtTime(1, c.currentTime + 2);

    // Rain intensity swells
    this.rainSwells();
    // Individual raindrop impacts
    this.rainDropScheduler();
    // Gentle wind gusts
    this.windScheduler();
  }

  private rainLayer(buf: AudioBuffer, lo: number, hi: number, vol: number) {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = buf; src.loop = true;
    const g = c.createGain(); g.gain.value = vol;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = hi; lp.Q.value = 0.5;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = lo;
    src.connect(g); g.connect(hp); hp.connect(lp); lp.connect(this.rainGain!);
    src.start(); this.track(src);
  }

  private rainSwells() {
    if (!this.running || this.scenePhase !== 'rain' || !this.rainGain) return;
    const c = this.ctx!;
    const now = c.currentTime;
    const dur = 3 + Math.random() * 5;
    const peak = 0.85 + Math.random() * 0.4;
    this.rainGain.gain.setValueAtTime(this.rainGain.gain.value, now);
    this.rainGain.gain.linearRampToValueAtTime(peak, now + dur * 0.4);
    this.rainGain.gain.linearRampToValueAtTime(0.8 + Math.random() * 0.2, now + dur);
    this.later(() => this.rainSwells(), dur * 1000 + 500);
  }

  private rainDropScheduler() {
    if (!this.running || this.scenePhase !== 'rain') return;
    this.singleDrop();
    this.later(() => this.rainDropScheduler(), 40 + Math.random() * 200);
  }

  private singleDrop() {
    const c = this.ctx!;
    if (!c || !this.rainGain) return;
    const now = c.currentTime;
    const freq = 800 + Math.random() * 4000;
    const dur = 0.01 + Math.random() * 0.03;
    const vol = 0.002 + Math.random() * 0.006;

    const buf = this.whiteBuf(dur + 0.02);
    const src = c.createBufferSource(); src.buffer = buf;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 2 + Math.random() * 8;
    const g = c.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(vol, now + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(bp); bp.connect(g); g.connect(this.rainGain);
    src.start(now); src.stop(now + dur + 0.01);
  }

  private windScheduler() {
    if (!this.running || this.scenePhase !== 'rain') return;
    this.windGust();
    this.later(() => this.windScheduler(), 3000 + Math.random() * 7000);
  }

  private windGust() {
    const c = this.ctx!;
    if (!c || !this.rainGain) return;
    const now = c.currentTime;
    const dur = 2 + Math.random() * 3;
    const buf = this.noiseBuf(dur + 0.5);
    const src = c.createBufferSource(); src.buffer = buf;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(80, now);
    lp.frequency.linearRampToValueAtTime(50 + Math.random() * 60, now + dur * 0.5);
    lp.frequency.linearRampToValueAtTime(80, now + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.06 + Math.random() * 0.05, now + dur * 0.3);
    g.gain.linearRampToValueAtTime(0.03, now + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(lp); lp.connect(g); g.connect(this.rainGain);
    src.start(now); src.stop(now + dur + 0.1);
  }

  private fadeOutRain() {
    if (!this.rainGain || !this.ctx) return;
    const c = this.ctx;
    const now = c.currentTime;
    this.rainGain.gain.setValueAtTime(this.rainGain.gain.value, now);
    this.rainGain.gain.linearRampToValueAtTime(0, now + FADE_DURATION);
    this.later(() => {
      this.activeNodes.forEach(n => { try { n.stop(); } catch {} });
      this.activeNodes = [];
      this.rainGain?.disconnect();
      this.rainGain = null;
    }, FADE_DURATION * 1000 + 200);
  }

  // ─── Stream / Water ────────────────────────────────────

  private startStream() {
    const c = this.ctx!;
    this.postGain = c.createGain();
    this.postGain.gain.value = 0;
    this.postGain.connect(this.masterGain!);

    // Gentle brook: multiple modulated noise bands
    this.streamBand(120, 0.12, 0.04, 0.15);
    this.streamBand(350, 0.2, 0.03, 0.25);
    this.streamBand(800, 0.35, 0.02, 0.4);
    this.streamBand(1800, 0.5, 0.012, 0.6);
    this.streamBand(3500, 0.7, 0.006, 0.8);

    // Fade in
    this.postGain.gain.setValueAtTime(0, c.currentTime);
    this.postGain.gain.linearRampToValueAtTime(0.8, c.currentTime + 3);

    // Water drip splashes
    this.dripScheduler();
  }

  private streamBand(freq: number, q: number, vol: number, lfoRate: number) {
    const c = this.ctx!;
    const buf = this.pinkBuf(5);
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
    const g = c.createGain(); g.gain.value = vol;

    // LFO for organic movement
    const lfo = c.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = lfoRate + Math.random() * 0.3;
    const lfoG = c.createGain(); lfoG.gain.value = vol * 0.4;
    lfo.connect(lfoG); lfoG.connect(g.gain);
    lfo.start();

    src.connect(bp); bp.connect(g); g.connect(this.postGain!);
    src.start(); this.track(src); this.activeNodes.push(lfo as unknown as OscillatorNode);
  }

  private dripScheduler() {
    if (!this.running || this.scenePhase !== 'postRain') return;
    this.waterDrip();
    this.later(() => this.dripScheduler(), 600 + Math.random() * 3000);
  }

  private waterDrip() {
    const c = this.ctx!;
    if (!c || !this.postGain) return;
    const now = c.currentTime;
    const freq = 1200 + Math.random() * 2500;
    const dur = 0.04 + Math.random() * 0.06;

    const osc = c.createOscillator(); osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.5, now + dur);

    const g = c.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.015 + Math.random() * 0.015, now + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(g); g.connect(this.postGain);
    osc.start(now); osc.stop(now + dur + 0.01);
  }

  private fadeOutStream() {
    if (!this.postGain || !this.ctx) return;
    const c = this.ctx;
    const now = c.currentTime;
    this.postGain.gain.setValueAtTime(this.postGain.gain.value, now);
    this.postGain.gain.linearRampToValueAtTime(0, now + FADE_DURATION);
    this.later(() => {
      this.activeNodes.forEach(n => { try { n.stop(); } catch {} });
      this.activeNodes = [];
      this.postGain?.disconnect();
      this.postGain = null;
    }, FADE_DURATION * 1000 + 200);
  }

  // ─── Bird Calls (FM Synthesis) ─────────────────────────

  private birdScheduler() {
    if (!this.running || this.scenePhase !== 'postRain') return;
    this.triggerBird();
    this.later(() => this.birdScheduler(), 1200 + Math.random() * 5000);
  }

  private triggerBird() {
    const types = [this.warbler, this.nightingale, this.cuckoo, this.robin] as const;
    types[Math.floor(Math.random() * types.length)].call(this);
  }

  /** Warbler: rapid descending trill */
  private warbler() {
    const c = this.ctx!;
    if (!c || !this.postGain) return;
    const now = c.currentTime;
    const notes = 4 + Math.floor(Math.random() * 6);
    const base = 2800 + Math.random() * 1200;

    for (let i = 0; i < notes; i++) {
      const t = now + i * (0.07 + Math.random() * 0.04);
      const f = base - i * (40 + Math.random() * 30);
      this.fmNote(t, f, 0.05 + Math.random() * 0.03, 0.02 + Math.random() * 0.015, f * 2, 80);
    }
  }

  /** Nightingale: long melodic phrases with vibrato */
  private nightingale() {
    const c = this.ctx!;
    if (!c || !this.postGain) return;
    const now = c.currentTime;
    const phrases = 2 + Math.floor(Math.random() * 3);
    let t = now;

    for (let p = 0; p < phrases; p++) {
      const f = 1800 + Math.random() * 1000;
      const dur = 0.15 + Math.random() * 0.2;
      this.fmNote(t, f, dur, 0.025, f * 1.5, 120 + Math.random() * 80);
      t += dur + 0.05 + Math.random() * 0.1;
    }
  }

  /** Cuckoo: classic two-note call */
  private cuckoo() {
    const c = this.ctx!;
    if (!c || !this.postGain) return;
    const now = c.currentTime;
    const hi = 1200 + Math.random() * 300;
    const lo = hi * 0.75;
    this.fmNote(now, hi, 0.18, 0.02, hi * 2, 40);
    this.fmNote(now + 0.35, lo, 0.25, 0.018, lo * 2, 40);
  }

  /** Robin: cheerful rising chirps */
  private robin() {
    const c = this.ctx!;
    if (!c || !this.postGain) return;
    const now = c.currentTime;
    const n = 3 + Math.floor(Math.random() * 4);
    const base = 2200 + Math.random() * 800;

    for (let i = 0; i < n; i++) {
      const t = now + i * (0.1 + Math.random() * 0.06);
      const f = base + i * (50 + Math.random() * 60);
      this.fmNote(t, f, 0.06 + Math.random() * 0.04, 0.02, f * 3, 60);
    }
  }

  /** FM synthesis note — carrier + modulator for natural timbre */
  private fmNote(t: number, freq: number, dur: number, vol: number, modFreq: number, modDepth: number) {
    const c = this.ctx!;
    if (!this.postGain) return;

    // Modulator
    const mod = c.createOscillator(); mod.type = 'sine'; mod.frequency.value = modFreq;
    const modG = c.createGain(); modG.gain.value = modDepth;
    mod.connect(modG);

    // Carrier
    const car = c.createOscillator(); car.type = 'sine';
    car.frequency.setValueAtTime(freq, t);
    // Slight pitch drift for naturalness
    car.frequency.linearRampToValueAtTime(freq * (0.97 + Math.random() * 0.06), t + dur);
    modG.connect(car.frequency);

    // Vibrato LFO
    const vib = c.createOscillator(); vib.type = 'sine'; vib.frequency.value = 5 + Math.random() * 3;
    const vibG = c.createGain(); vibG.gain.value = freq * 0.015;
    vib.connect(vibG); vibG.connect(car.frequency);

    // Envelope
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.setValueAtTime(vol * 0.9, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    car.connect(g); g.connect(this.postGain);

    mod.start(t); car.start(t); vib.start(t);
    mod.stop(t + dur + 0.02); car.stop(t + dur + 0.02); vib.stop(t + dur + 0.02);
  }

  // ─── Cricket (Night Insects) ───────────────────────────

  private cricketScheduler() {
    if (!this.running || this.scenePhase !== 'postRain') return;
    this.cricket();
    this.later(() => this.cricketScheduler(), 2000 + Math.random() * 6000);
  }

  private cricket() {
    const c = this.ctx!;
    if (!c || !this.postGain) return;
    const now = c.currentTime;
    const pulses = 4 + Math.floor(Math.random() * 8);
    const rate = 0.018 + Math.random() * 0.012;
    const freq = 4200 + Math.random() * 1500;

    for (let i = 0; i < pulses; i++) {
      const t = now + i * rate;
      const osc = c.createOscillator(); osc.type = 'sine';
      osc.frequency.value = freq + (Math.random() - 0.5) * 80;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.012 + Math.random() * 0.008, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.008);
      osc.connect(g); g.connect(this.postGain);
      osc.start(t); osc.stop(t + 0.012);
    }
  }

  // ─── Scene Loop ────────────────────────────────────────

  private runScene() {
    if (!this.running) return;
    this.scenePhase = 'rain';
    this.startRain();

    // After RAIN_DURATION, fade rain → start post-rain
    this.later(() => {
      if (!this.running) return;
      this.fadeOutRain();

      this.later(() => {
        if (!this.running) return;
        this.scenePhase = 'postRain';
        this.startStream();
        this.birdScheduler();
        this.cricketScheduler();

        // After POST_RAIN_DURATION, fade stream → loop
        this.later(() => {
          if (!this.running) return;
          this.fadeOutStream();

          this.later(() => {
            if (this.running) this.runScene();
          }, FADE_DURATION * 1000 + 500);

        }, POST_RAIN_DURATION * 1000);
      }, FADE_DURATION * 1000 + 500);
    }, RAIN_DURATION * 1000);
  }

  // ─── Public API ────────────────────────────────────────

  async start(): Promise<void> {
    if (this.running) return;
    try {
      this.ctx = new AudioContext();
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(this.ctx.destination);
      this.running = true;
      this.notify();
      this.runScene();
    } catch (err) {
      console.warn('[Murmur AudioEngine] Start failed:', err);
      this.running = false;
      this.cleanup();
      throw err;
    }
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.timers.forEach(id => clearTimeout(id));
    this.timers = [];
    this.cleanup();
    this.notify();
  }

  setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain) this.masterGain.gain.value = this.volume;
  }

  private cleanup(): void {
    this.activeNodes.forEach(n => { try { n.stop(); } catch {} });
    this.activeNodes = [];
    [this.rainGain, this.postGain, this.masterGain].forEach(g => {
      if (g) { try { g.disconnect(); } catch {} }
    });
    this.rainGain = null;
    this.postGain = null;
    this.masterGain = null;
    if (this.ctx) { this.ctx.close(); this.ctx = null; }
  }

  destroy(): void {
    this.stop();
    this.listeners.clear();
  }
}