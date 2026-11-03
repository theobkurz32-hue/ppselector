import { createDiesel, createNoise, filteredNoise, smooth } from './AudioPrimitives';
import { ProceduralRadio } from './ProceduralRadio';

export interface TrafficSound {
  id: number;
  /** Signed distance in road coordinates: positive is in front of the player. */
  forward: number;
  lateral: number;
  speed: number;
  direction: number;
  kind: string;
}
interface NoiseLayer { source: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode }
interface TrafficVoice { id: number; engine: OscillatorNode; gain: GainNode; tires: NoiseLayer; pan: StereoPannerNode }

/** Layered original Web Audio synthesis. Works offline after a user gesture. */
export class AudioEngine {
  enabled = true;
  private ctx?: AudioContext;
  private master?: GainNode;
  private environment?: GainNode;
  private engine?: AudioBufferSourceNode;
  private engineGain?: GainNode;
  private engineFilter?: BiquadFilterNode;
  private turbo?: OscillatorNode;
  private turboGain?: GainNode;
  private hornGain?: GainNode;
  private reverseGain?: GainNode;
  private reverse = false;
  private intake?: NoiseLayer;
  private tires?: NoiseLayer;
  private wind?: NoiseLayer;
  private rain?: NoiseLayer;
  private insects?: NoiseLayer;
  private noise?: AudioBuffer;
  private music?: ProceduralRadio;
  private voices: TrafficVoice[] = [];
  private radio = false;
  private paused = true;
  private hidden = false;
  private inCabin = false;
  private hour = 9;
  private lastRpm = 600;
  private lastSpeed = 0;
  private lastTime = 0;
  private nextBird = 0;
  private lastAirBrake = -10;
  private lastShift = -10;

  constructor() {
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
      this.hidden = document.hidden;
      this.applyVolume();
    });
  }

  get radioEnabled(): boolean { return this.radio; }
  get state(): AudioContextState | 'uninitialized' { return this.ctx?.state ?? 'uninitialized'; }

  async start(): Promise<void> {
    if (this.ctx) { await this.ctx.resume(); return; }
    const Audio = globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Audio) { this.enabled = false; return; }
    const context = new Audio({ latencyHint: 'interactive' }); this.ctx = context;
    this.noise = createNoise(context);
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -16; compressor.knee.value = 16;
    compressor.ratio.value = 5; compressor.attack.value = 0.003; compressor.release.value = 0.23;
    this.master = context.createGain(); this.master.gain.value = 0;
    this.master.connect(compressor).connect(context.destination);
    this.environment = context.createGain(); this.environment.gain.value = 1;
    this.environment.connect(this.master);

    this.engine = context.createBufferSource(); this.engine.buffer = createDiesel(context); this.engine.loop = true;
    this.engineFilter = context.createBiquadFilter(); this.engineFilter.type = 'lowpass'; this.engineFilter.frequency.value = 720;
    this.engineGain = context.createGain(); this.engineGain.gain.value = 0;
    this.engine.connect(this.engineFilter).connect(this.engineGain).connect(this.master); this.engine.start();
    this.intake = filteredNoise(context, this.noise, this.master, 'bandpass', 360);
    this.intake.filter.Q.value = 0.65;
    this.tires = filteredNoise(context, this.noise, this.master, 'bandpass', 930);
    this.tires.filter.Q.value = 0.5;
    this.wind = filteredNoise(context, this.noise, this.environment, 'lowpass', 420);
    this.rain = filteredNoise(context, this.noise, this.environment, 'highpass', 1450);
    this.insects = filteredNoise(context, this.noise, this.environment, 'bandpass', 4200);
    this.insects.filter.Q.value = 7;

    this.turbo = context.createOscillator(); this.turbo.type = 'sine';
    this.turboGain = context.createGain(); this.turboGain.gain.value = 0;
    this.turbo.connect(this.turboGain).connect(this.master); this.turbo.start();
    this.hornGain = context.createGain(); this.hornGain.gain.value = 0;
    const hornFilter = context.createBiquadFilter(); hornFilter.type = 'lowpass'; hornFilter.frequency.value = 950;
    this.hornGain.connect(hornFilter).connect(this.master);
    for (const frequency of [145, 207]) {
      const horn = context.createOscillator(); horn.type = 'sawtooth'; horn.frequency.value = frequency;
      horn.connect(this.hornGain); horn.start();
    }
    const reverseTone = context.createOscillator(); reverseTone.type = 'sine'; reverseTone.frequency.value = 1020;
    this.reverseGain = context.createGain(); this.reverseGain.gain.value = 0;
    reverseTone.connect(this.reverseGain).connect(this.master); reverseTone.start();
    this.music = new ProceduralRadio(context, this.master);
    await context.resume();
  }

  setEnabled(enabled: boolean): void { this.enabled = enabled; this.applyVolume(); }
  toggleRadio(): boolean { this.radio = !this.radio; return this.radio; }
  setReverse(reverse: boolean): void { this.reverse = reverse; }
  setEnvironment(hour: number, inCabin: boolean): void { this.hour = hour; this.inCabin = inCabin; }

  private applyVolume(): void {
    if (!this.ctx || !this.master) return;
    smooth(this.master.gain, this.enabled && !this.paused && !this.hidden ? 0.64 : 0, this.ctx.currentTime, 0.07);
  }

  update(rpm: number, speed: number, throttle: number, wet: number, horn: boolean, paused: boolean): void {
    this.paused = paused; this.applyVolume();
    if (!this.ctx || !this.engine) return;
    const time = this.ctx.currentTime;
    const active = !paused && !this.hidden && this.enabled;
    const velocity = Math.abs(speed), load = Math.max(0, Math.min(1, throttle));
    const engineRpm = Math.max(500, Math.min(2600, rpm));
    const duration = Math.max(0.01, Math.min(0.25, time - this.lastTime));
    const deceleration = (velocity - this.lastSpeed) / duration;
    smooth(this.engine.playbackRate, engineRpm / 600, time, 0.1);
    smooth(this.engineFilter!.frequency, (480 + load * 920 + engineRpm * 0.16) * (this.inCabin ? 0.72 : 1), time);
    smooth(this.engineGain!.gain, 0.32 + load * 0.32 + (load < 0.05 && velocity > 8 ? 0.08 : 0), time);
    smooth(this.intake!.gain.gain, 0.026 + load * 0.08, time);
    smooth(this.intake!.filter.frequency, 220 + engineRpm * 0.24, time);
    smooth(this.turbo!.frequency, 900 + engineRpm * 1.05 + load * 450, time, 0.3);
    smooth(this.turboGain!.gain, load * Math.min(0.018, engineRpm / 110000), time, 0.25);
    smooth(this.tires!.gain.gain, Math.min(0.2, velocity * 0.0042) * (1 + wet * 0.8), time);
    smooth(this.tires!.filter.frequency, 550 + velocity * 24 + wet * 650, time);
    smooth(this.wind!.gain.gain, Math.min(0.15, 0.016 + velocity * 0.0035), time, 0.35);
    smooth(this.rain!.gain.gain, wet * (this.inCabin ? 0.14 : 0.23), time, 0.4);
    smooth(this.environment!.gain, this.inCabin ? 0.48 : 1, time, 0.15);
    smooth(this.hornGain!.gain, active && horn ? 0.15 : 0, time, horn ? 0.045 : 0.08);
    smooth(this.reverseGain!.gain, this.reverse && time % 1 < 0.32 ? (this.inCabin ? 0.025 : 0.04) : 0, time, 0.018);
    const night = this.hour < 6 || this.hour > 19;
    smooth(this.insects!.gain.gain, night ? Math.max(0, Math.sin(time * 7)) * 0.027 * (1 - wet * 0.8) : 0, time, 0.025);
    if (active) {
      if (engineRpm < this.lastRpm - 190 && velocity > 3 && time - this.lastShift > 0.5) {
        this.airBurst(0.1, 0.065, 1250); this.lastShift = time;
      }
      if ((velocity < 0.7 && this.lastSpeed > 0.7 || deceleration < -2.8 && velocity > 2) && time - this.lastAirBrake > 2.5) {
        this.playAirBrake(); this.lastAirBrake = time;
      }
      if (!night && wet < 0.55 && time > this.nextBird) {
        this.birdCall(); this.nextBird = time + 5 + Math.random() * 13;
      }
    }
    this.music?.update(active && this.radio);
    this.lastRpm = engineRpm; this.lastSpeed = velocity; this.lastTime = time;
  }

  /** A fixed small voice pool follows the nearest traffic, with approximate Doppler. */
  updateTraffic(vehicles: TrafficSound[], playerSpeed: number): void {
    if (!this.ctx || !this.environment || !this.noise) return;
    const context = this.ctx, time = context.currentTime;
    const nearby = vehicles.filter(v => Math.hypot(v.forward, v.lateral) < 125)
      .sort((a, b) => Math.abs(a.forward) - Math.abs(b.forward)).slice(0, 6);
    const used = new Set<number>();
    for (const vehicle of nearby) {
      let voice = this.voices.find(candidate => candidate.id === vehicle.id);
      if (!voice) {
        voice = this.voices.find(candidate => !nearby.some(v => v.id === candidate.id) && !used.has(candidate.id));
        if (!voice && this.voices.length < 6) { voice = this.createTrafficVoice(); this.voices.push(voice); }
        if (!voice) continue;
        voice.id = vehicle.id;
      }
      used.add(vehicle.id);
      const distance = Math.max(3, Math.hypot(vehicle.forward, vehicle.lateral));
      const radialVelocity = vehicle.forward / distance * (Math.abs(vehicle.speed) * vehicle.direction - playerSpeed);
      const doppler = Math.max(0.78, Math.min(1.25, 343 / (343 + radialVelocity)));
      const heavy = vehicle.kind === 'truck' || vehicle.kind === 'bus';
      const amplitude = Math.min(0.2, (heavy ? 0.8 : 0.48) / (1 + distance * 0.18));
      smooth(voice.engine.frequency, (heavy ? 43 + vehicle.speed * 1.1 : 65 + vehicle.speed * 1.8) * doppler, time, 0.04);
      smooth(voice.gain.gain, amplitude, time, 0.07);
      smooth(voice.tires.gain.gain, amplitude * Math.min(0.8, Math.abs(vehicle.speed) / 28), time, 0.07);
      smooth(voice.tires.filter.frequency, (700 + Math.abs(vehicle.speed) * 24) * doppler, time, 0.06);
      smooth(voice.pan.pan, Math.max(-0.95, Math.min(0.95, vehicle.lateral / Math.max(4, Math.abs(vehicle.forward) * 0.22))), time, 0.08);
    }
    for (const voice of this.voices) if (!used.has(voice.id)) {
      smooth(voice.gain.gain, 0, time); smooth(voice.tires.gain.gain, 0, time);
    }
  }

  private createTrafficVoice(): TrafficVoice {
    const context = this.ctx!, pan = context.createStereoPanner(); pan.connect(this.environment!);
    const engine = context.createOscillator(); engine.type = 'triangle';
    const gain = context.createGain(); gain.gain.value = 0; engine.connect(gain).connect(pan); engine.start();
    const tires = filteredNoise(context, this.noise!, pan, 'bandpass', 1100); tires.filter.Q.value = 0.6;
    return { id: -1, engine, gain, tires, pan };
  }

  playAirBrake(): void { this.airBurst(0.4, 0.2, 1700); }

  private airBurst(duration: number, volume: number, frequency: number): void {
    if (!this.ctx || !this.noise || !this.master) return;
    const context = this.ctx, source = context.createBufferSource(); source.buffer = this.noise;
    const filter = context.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = frequency; filter.Q.value = 0.6;
    const gain = context.createGain(); const time = context.currentTime;
    gain.gain.setValueAtTime(0.0001, time); gain.gain.exponentialRampToValueAtTime(volume, time + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter).connect(gain).connect(this.master); source.start(time, Math.random() * 0.8); source.stop(time + duration);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }

  private birdCall(): void {
    if (!this.ctx || !this.environment) return;
    const context = this.ctx;
    for (let i = 0; i < 3; i++) {
      const oscillator = context.createOscillator(), gain = context.createGain(), pan = context.createStereoPanner();
      const start = context.currentTime + 0.1 + i * 0.14, frequency = 1900 + Math.random() * 1200;
      oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.24, start + 0.05);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.84, start + 0.13);
      gain.gain.setValueAtTime(0.0001, start); gain.gain.exponentialRampToValueAtTime(0.025, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.14); pan.pan.value = Math.sin(this.nextBird * 9) * 0.8;
      oscillator.connect(gain).connect(pan).connect(this.environment); oscillator.start(start); oscillator.stop(start + 0.15);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); pan.disconnect(); };
    }
  }

  /** The argument is relative impact speed in m/s. Compression keeps peaks safe. */
  impact(relativeSpeed = 8): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const context = this.ctx, time = context.currentTime, strength = Math.max(0.15, Math.min(1, Math.abs(relativeSpeed) / 20));
    this.airBurst(0.28 + strength * 0.25, 0.35 + strength * 0.6, 450 + strength * 550);
    for (const [frequency, duration, volume] of [[62, 0.5, 0.45], [410, 0.23, 0.1]] as const) {
      const oscillator = context.createOscillator(), gain = context.createGain(); oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(frequency, time); oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.35, time + duration);
      gain.gain.setValueAtTime(volume * strength, time); gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
      oscillator.connect(gain).connect(this.master); oscillator.start(); oscillator.stop(time + duration + 0.01);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    }
  }
}
