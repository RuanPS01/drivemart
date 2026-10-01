/** Estado do carro usado pela mixagem a cada quadro. */
export interface AudioFrame {
  /** Velocidade escalar para a frente (m/s, negativa em ré). */
  speed: number;
  /** Acelerador de 0 a 1. */
  throttle: number;
  /** Derrapagem de 0 a 1 (velocidade lateral ou freio de mão). */
  skid: number;
}

/** Faixas de velocidade de cada marcha (m/s), para o giro subir e cair como num câmbio de verdade. */
const GEARS = [0, 11, 22, 33, 43, 60];
const IDLE_RPM = 850;
const MAX_RPM = 6200;

/** Giro simulado do motor a partir da velocidade e do acelerador (exportado para testes). */
export function engineRpm(speed: number, throttle: number): number {
  const v = Math.abs(speed);
  let g = 0;
  while (g < GEARS.length - 2 && v > GEARS[g + 1]!) g++;
  const lo = GEARS[g]!,
    hi = GEARS[g + 1]!;
  const t = Math.min(1, (v - lo) / (hi - lo));
  // Na primeira marcha, parado e acelerando, o giro sobe mesmo sem velocidade.
  const base = g === 0 ? Math.max(t, throttle * 0.35) : 0.3 + t * 0.7;
  return IDLE_RPM + (MAX_RPM - IDLE_RPM) * Math.min(1, base) * (0.85 + throttle * 0.15);
}

/**
 * Som do jogo sintetizado com WebAudio (nada de arquivos): motor com troca de marcha,
 * cantada de pneu, vento, batidas e objetos quebrando.
 * O contexto só é criado depois do primeiro gesto do usuário, como exigem os navegadores.
 */
export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private oscs: OscillatorNode[] = [];
  private skidGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private volume = 0.7;
  private ducked = false;
  private hidden = false;
  private lastImpact = 0;

  constructor() {
    window.addEventListener('pointerdown', this.unlock);
    window.addEventListener('keydown', this.unlock);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  private unlock = (): void => {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !this.hidden) void this.ctx.resume();
      return;
    }
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    try {
      this.ctx = new Ctx();
    } catch {
      return;
    }
    this.build(this.ctx);
  };

  private onVisibility = (): void => {
    this.hidden = document.hidden;
    if (!this.ctx) return;
    if (this.hidden) void this.ctx.suspend();
    else void this.ctx.resume();
  };

  private build(ctx: AudioContext): void {
    this.master = ctx.createGain();
    this.master.gain.value = this.targetVolume();
    this.master.connect(ctx.destination);

    // Ruído branco reaproveitado por pneus, vento e batidas.
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // Motor: três osciladores (fundamental, sub e harmônico) com distorção leve e filtro passa-baixa.
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.Q.value = 4;
    const shaper = ctx.createWaveShaper();
    shaper.curve = distortionCurve(18);
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    for (const [type, gain] of [
      ['sawtooth', 0.5],
      ['square', 0.28],
      ['sawtooth', 0.16],
    ] as [OscillatorType, number][]) {
      const o = ctx.createOscillator();
      o.type = type;
      const g = ctx.createGain();
      g.gain.value = gain;
      o.connect(g).connect(shaper);
      o.start();
      this.oscs.push(o);
    }
    shaper.connect(this.engineFilter).connect(this.engineGain).connect(this.master);

    this.skidGain = this.loopNoise(ctx, 'bandpass', 1900, 3);
    this.windGain = this.loopNoise(ctx, 'lowpass', 500, 0.7);
  }

  private loopNoise(ctx: AudioContext, type: BiquadFilterType, freq: number, q: number): GainNode {
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(this.master!);
    src.start();
    return g;
  }

  private targetVolume(): number {
    return this.volume * (this.ducked ? 0.25 : 1) * 0.6;
  }

  /** Volume geral de 0 a 1. */
  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    this.master?.gain.setTargetAtTime(this.targetVolume(), this.ctx!.currentTime, 0.05);
  }

  /** Abaixa o som com um modal aberto. */
  setDucked(ducked: boolean): void {
    this.ducked = ducked;
    if (this.ctx && this.master)
      this.master.gain.setTargetAtTime(this.targetVolume(), this.ctx.currentTime, 0.2);
  }

  update(f: AudioFrame): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !this.engineGain) return;
    const t = ctx.currentTime;
    const rpm = engineRpm(f.speed, f.throttle);
    // Motor de 4 cilindros: duas explosões por volta.
    const freq = (rpm / 60) * 2;
    this.oscs[0]!.frequency.setTargetAtTime(freq, t, 0.03);
    this.oscs[1]!.frequency.setTargetAtTime(freq * 0.5, t, 0.03);
    this.oscs[2]!.frequency.setTargetAtTime(freq * 2.01, t, 0.03);
    this.engineFilter!.frequency.setTargetAtTime(260 + f.throttle * 900 + rpm * 0.18, t, 0.05);
    this.engineGain.gain.setTargetAtTime(0.16 + f.throttle * 0.14, t, 0.05);
    const v = Math.abs(f.speed);
    this.skidGain!.gain.setTargetAtTime(Math.min(1, f.skid) * 0.32 * Math.min(1, v / 6), t, 0.04);
    this.windGain!.gain.setTargetAtTime(Math.min(0.22, (v / 50) ** 2 * 0.22), t, 0.2);
  }

  /** Batida do carro (força de 0 a 1). */
  impact(strength: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (now - this.lastImpact < 0.12) return;
    this.lastImpact = now;
    const s = Math.max(0.15, Math.min(1, strength));
    this.burst('lowpass', 700 + s * 900, 0.28 + s * 0.3, 0.5 * s);
    // Pancada grave.
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(90, now);
    o.frequency.exponentialRampToValueAtTime(38, now + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.6 * s, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    o.connect(g).connect(this.master);
    o.start(now);
    o.stop(now + 0.32);
  }

  /** Objeto de rua derrubado (cone, caixa, mesa...). */
  smash(strength: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || ctx.state !== 'running') return;
    const s = Math.max(0.2, Math.min(1, strength));
    this.burst('bandpass', 1200 + Math.random() * 1600, 0.12 + s * 0.12, 0.35 * s);
    // Estalos de plástico e madeira.
    const now = ctx.currentTime;
    for (let k = 0; k < 3; k++) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = 300 + Math.random() * 900;
      const g = ctx.createGain();
      const t0 = now + k * 0.04 + Math.random() * 0.03;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.setValueAtTime(0.08 * s, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06);
      o.connect(g).connect(this.master);
      o.start(now);
      o.stop(t0 + 0.08);
    }
  }

  private burst(type: BiquadFilterType, freq: number, dur: number, gain: number): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(now, Math.random());
    src.stop(now + dur + 0.02);
  }

  dispose(): void {
    window.removeEventListener('pointerdown', this.unlock);
    window.removeEventListener('keydown', this.unlock);
    document.removeEventListener('visibilitychange', this.onVisibility);
    void this.ctx?.close();
    this.ctx = null;
  }
}

function distortionCurve(k: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}
