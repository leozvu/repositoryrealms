// Original synthesized ambience. Audio starts only after an explicit user gesture.
export function createOfficeAudio() {
  let context, master, wind, noise, filter, enabled = false, lastStep = 0;
  function start() {
    const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Audio) return false;
    if (!context) {
      context = new Audio();
      master = context.createGain(); master.gain.value = 0; master.connect(context.destination);
      const buffer = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
      const data = buffer.getChannelData(0);
      // A deterministic, seamless-enough noise bed, filtered to a quiet interior breeze.
      let seed = 71423;
      for (let index = 0; index < data.length; index++) { seed = (seed * 16807) % 2147483647; data[index] = seed / 1073741824 - 1; }
      noise = buffer;
      wind = context.createBufferSource(); wind.buffer = buffer; wind.loop = true;
      filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 370;
      const air = context.createGain(); air.gain.value = .026;
      wind.connect(filter); filter.connect(air); air.connect(master); wind.start();
    }
    return true;
  }
  return {
    async toggle() {
      if (!start()) return false;
      enabled = !enabled;
      if (enabled) await context.resume();
      master.gain.setTargetAtTime(enabled ? .65 : 0, context.currentTime, .12);
      return enabled;
    },
    update({ moving, time, speed, paused }) {
      if (!enabled || !context || context.state !== 'running') return;
      master.gain.setTargetAtTime(paused ? .12 : .65, context.currentTime, .3);
      if (!moving || paused || time - lastStep < (speed > 4 ? .27 : .39)) return;
      lastStep = time;
      const step = context.createBufferSource(); step.buffer = noise;
      const low = context.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 650;
      const gain = context.createGain(), now = context.currentTime;
      gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(.15, now + .006);
      gain.gain.exponentialRampToValueAtTime(.001, now + .085);
      step.connect(low); low.connect(gain); gain.connect(master);
      step.start(now, (time * .31) % 2); step.stop(now + .1);
      step.onended = () => { step.disconnect(); low.disconnect(); gain.disconnect(); };
    },
    suspend() { if (context?.state === 'running') context.suspend().catch(() => {}); },
    resume() { if (enabled && context?.state === 'suspended') context.resume().catch(() => {}); },
    dispose() { enabled = false; wind?.stop(); wind?.disconnect(); filter?.disconnect(); master?.disconnect(); context?.close().catch(() => {}); },
  };
}
