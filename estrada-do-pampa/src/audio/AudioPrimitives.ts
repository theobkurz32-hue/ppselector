/** Original generated sources: no third-party recordings or live streams. */
export function createNoise(context: BaseAudioContext, seconds = 2): AudioBuffer {
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * seconds), context.sampleRate);
  const samples = buffer.getChannelData(0);
  let state = 293;
  for (let i = 0; i < samples.length; i++) {
    state = Math.imul(state ^ state >>> 16, 0x21f0aaad);
    state = Math.imul(state ^ state >>> 15, 0x735a2d97);
    state ^= state >>> 15;
    samples[i] = (state >>> 0) / 2147483648 - 1;
  }
  return buffer;
}

/** One second of a six-cylinder four-stroke diesel at 600 RPM: 30 firings/s. */
export function createDiesel(context: BaseAudioContext): AudioBuffer {
  const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
  const samples = buffer.getChannelData(0);
  let random = 293;
  for (let i = 0; i < samples.length; i++) {
    const time = i / context.sampleRate;
    const firing = Math.floor(time * 30);
    const age = time - firing / 30;
    random = (Math.imul(random, 1664525) + 1013904223) | 0;
    const noise = (random >>> 0) / 2147483648 - 1;
    const variation = 0.88 + Math.sin(firing * 2.39996) * 0.12;
    const body = Math.sin(age * Math.PI * 2 * 83) * Math.exp(-age * 75);
    const compression = Math.sin(age * Math.PI * 2 * 162) * Math.exp(-age * 130);
    const knock = noise * Math.exp(-age * 390);
    const crank = Math.sin(time * Math.PI * 2 * 10) * 0.16;
    samples[i] = Math.tanh((body * 0.85 + compression * 0.34 + knock * 0.33) * variation + crank) * 0.8;
  }
  return buffer;
}

export function filteredNoise(context: AudioContext, buffer: AudioBuffer, destination: AudioNode, type: BiquadFilterType, frequency: number): { source: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const filter = context.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  const gain = context.createGain();
  gain.gain.value = 0;
  source.connect(filter).connect(gain).connect(destination);
  source.start(0, Math.random() * Math.max(0, buffer.duration - 0.01));
  return { source, gain, filter };
}

export function smooth(parameter: AudioParam, value: number, time: number, response = 0.12): void {
  parameter.setTargetAtTime(value, time, response);
}
