// Original, generated sound only: every effect here is synthesized with the WebAudio API at
// runtime (oscillators and noise buffers), nothing played back from a file, so there is no
// copyrighted audio anywhere in the game.
export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let unlocked = false;

  function ensureCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  /** Must be called from a user gesture (click/keydown) to satisfy autoplay policies. */
  function unlock() {
    const c = ensureCtx();
    if (!c || unlocked) return;
    unlocked = true;
  }

  function beep(freq, duration, type = 'sine', gainValue = 0.18, when = 0) {
    const c = ensureCtx();
    if (!c) return;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = gainValue;
    osc.connect(gain).connect(c.destination);
    const t0 = c.currentTime + when;
    gain.gain.setValueAtTime(gainValue, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  function noiseBurst(duration, gainValue = 0.25) {
    const c = ensureCtx();
    if (!c) return;
    const n = Math.max(1, Math.floor(c.sampleRate * duration));
    const buffer = c.createBuffer(1, n, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource();
    src.buffer = buffer;
    const gain = c.createGain();
    gain.gain.value = gainValue;
    src.connect(gain).connect(c.destination);
    src.start();
  }

  return {
    unlock,
    /** A soft click for UI / menu confirm. */
    uiBeep() {
      beep(660, 0.08, 'triangle', 0.12);
    },
    /** A short punchy thud for melee hits. */
    punch() {
      beep(120, 0.09, 'square', 0.2);
      noiseBurst(0.06, 0.15);
    },
    /** A quick pop for the ranged attack firing. */
    shoot() {
      beep(880, 0.05, 'sawtooth', 0.12);
      noiseBurst(0.04, 0.1);
    },
    /** A dull crash for vehicle collisions. */
    crash() {
      noiseBurst(0.18, 0.3);
      beep(70, 0.2, 'square', 0.18);
    },
    /** A rising chime for mission progress / cash pickups. */
    chime(success = true) {
      const base = success ? 523.25 : 196;
      beep(base, 0.1, 'triangle', 0.16);
      beep(base * 1.5, 0.12, 'triangle', 0.14, 0.09);
      if (success) beep(base * 2, 0.16, 'triangle', 0.12, 0.18);
    },
    /** A short two-tone alert when the wanted level rises. */
    alert(level) {
      beep(300 + level * 40, 0.12, 'square', 0.14);
    },
    /** Starts (or restarts) a looping engine hum whose pitch tracks `speedFrac` in [0, 1]. */
    startEngine() {
      const c = ensureCtx();
      if (!c || engineOsc) return;
      engineOsc = c.createOscillator();
      engineGain = c.createGain();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 60;
      engineGain.gain.value = 0;
      engineOsc.connect(engineGain).connect(c.destination);
      engineOsc.start();
    },
    updateEngine(speedFrac) {
      if (!engineOsc || !ctx) return;
      engineOsc.frequency.setTargetAtTime(55 + speedFrac * 160, ctx.currentTime, 0.08);
      engineGain.gain.setTargetAtTime(0.05 + speedFrac * 0.07, ctx.currentTime, 0.08);
    },
    stopEngine() {
      if (!engineOsc) return;
      try {
        engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
        engineOsc.stop(ctx.currentTime + 0.2);
      } catch {
        // already stopped
      }
      engineOsc = null;
      engineGain = null;
    },
    /** Starts a looping police siren wail; call stopSiren() when no police are near. */
    startSiren() {
      const c = ensureCtx();
      if (!c || sirenOsc) return;
      sirenOsc = c.createOscillator();
      sirenGain = c.createGain();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 500;
      sirenGain.gain.value = 0.05;
      sirenOsc.connect(sirenGain).connect(c.destination);
      sirenOsc.start();
    },
    updateSiren(t) {
      if (!sirenOsc || !ctx) return;
      sirenOsc.frequency.setTargetAtTime(500 + Math.sin(t * 6) * 220, ctx.currentTime, 0.02);
    },
    stopSiren() {
      if (!sirenOsc) return;
      try {
        sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        sirenOsc.stop(ctx.currentTime + 0.3);
      } catch {
        // already stopped
      }
      sirenOsc = null;
      sirenGain = null;
    },
  };
}
