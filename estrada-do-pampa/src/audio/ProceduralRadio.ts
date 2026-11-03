/** An original instrumental guitar/keyboard piece, synthesized inside the truck. */
export class ProceduralRadio {
  private step = 0;
  private nextNote = 0;
  private wave: PeriodicWave;
  private readonly output: GainNode;
  private readonly eighthNote = 60 / 96 / 2;

  constructor(private readonly context: AudioContext, destination: AudioNode) {
    const highpass = context.createBiquadFilter(); highpass.type = 'highpass'; highpass.frequency.value = 180;
    const lowpass = context.createBiquadFilter(); lowpass.type = 'lowpass'; lowpass.frequency.value = 3300;
    const pan = context.createStereoPanner(); pan.pan.value = 0.22;
    this.output = context.createGain(); this.output.gain.value = 0;
    highpass.connect(lowpass).connect(pan).connect(this.output).connect(destination);
    this.notesDestination = highpass;
    const real = new Float32Array(12), imaginary = new Float32Array(12);
    for (let i = 1; i < 12; i++) imaginary[i] = Math.pow(i, -1.4) * (i % 2 ? 1 : 0.7);
    this.wave = context.createPeriodicWave(real, imaginary);
  }
  private readonly notesDestination: AudioNode;

  update(active: boolean): void {
    const time = this.context.currentTime;
    this.output.gain.setTargetAtTime(active ? 0.2 : 0, time, 0.16);
    if (!active) { this.nextNote = time + 0.05; return; }
    if (this.nextNote < time) this.nextNote = time + 0.05;
    // A small scheduling horizon stays stable during slower rendered frames.
    while (this.nextNote < time + 0.8) {
      this.playStep(this.step++, this.nextNote);
      this.nextNote += this.eighthNote;
    }
  }

  private playStep(step: number, when: number): void {
    const chord = [40, 36, 43, 38][Math.floor(step / 12) % 4];
    const offsets = [12, 19, 24, 16, 19, 24, 12, 19, 24, 16, 19, 24];
    const position = step % 12;
    this.note(chord + offsets[position], when, 0.46, 0.18, true);
    if (position === 0 || position === 6) this.note(chord, when, 0.52, 0.29, false);
    if (position % 3 === 1) {
      const melody = [64, 67, 69, 67, 64, 62, 60, 64, 67, 71, 69, 67, 66, 64, 62, 59];
      this.note(melody[Math.floor(step / 3) % melody.length], when, 0.57, 0.1, false);
    }
  }

  private note(midi: number, when: number, duration: number, volume: number, plucked: boolean): void {
    const oscillator = this.context.createOscillator();
    if (plucked) oscillator.setPeriodicWave(this.wave); else oscillator.type = 'triangle';
    oscillator.frequency.value = 440 * 2 ** ((midi - 69) / 12);
    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(0.0001, when);
    envelope.gain.exponentialRampToValueAtTime(volume, when + 0.009);
    envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    oscillator.connect(envelope).connect(this.notesDestination);
    oscillator.start(when); oscillator.stop(when + duration + 0.01);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
  }
}
