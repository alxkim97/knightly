import { App } from './app.js';

export const Sound = (() => {
  let ctx = null;
  const tones = {
    move: [440, 0.07],
    capture: [330, 0.09],
    check: [660, 0.12],
    success: [523, 0.18],
    error: [180, 0.15],
  };

  function ensureCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }

  function play(type) {
    if (!App || !App.settings || !App.settings.sound) return;
    const [freq, dur] = tones[type] || tones.move;
    try {
      const c = ensureCtx();
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type === 'error' ? 'sawtooth' : 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.18, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start();
      osc.stop(c.currentTime + dur);
      if (type === 'success') {
        const osc2 = c.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.value = freq * 1.5;
        const gain2 = c.createGain();
        gain2.gain.setValueAtTime(0.15, c.currentTime + 0.1);
        gain2.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.1 + dur);
        osc2.connect(gain2);
        gain2.connect(c.destination);
        osc2.start(c.currentTime + 0.1);
        osc2.stop(c.currentTime + 0.1 + dur);
      }
    } catch { /* audio unavailable — fail silently */ }
  }

  return { play };
})();
