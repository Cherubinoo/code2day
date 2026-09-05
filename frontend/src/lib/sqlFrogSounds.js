// Tiny synthesized sound effects for SQL Frog — no external audio files
// (no licensing risk, no asset loading), just short Web Audio API
// oscillator blips. One shared AudioContext, created lazily on first use
// since browsers refuse to start one before a user gesture.

let ctx = null;
function getCtx() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq, startTime, duration, { type = "sine", gain = 0.15, glideTo = null } = {}) {
  const audio = getCtx();
  if (!audio) return;
  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, startTime + duration);
  g.gain.setValueAtTime(gain, startTime);
  g.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  osc.connect(g).connect(audio.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

function safeSound(fn) {
  try { fn(); } catch { /* audio is a nice-to-have, never block the game on it */ }
}

export const sqlFrogSounds = {
  jump() {
    safeSound(() => {
      const audio = getCtx();
      if (!audio) return;
      tone(440, audio.currentTime, 0.12, { type: "square", gain: 0.12, glideTo: 660 });
    });
  },
  success() {
    safeSound(() => {
      const audio = getCtx();
      if (!audio) return;
      const t = audio.currentTime;
      [523.25, 659.25, 784.0].forEach((f, i) => tone(f, t + i * 0.09, 0.16, { type: "triangle", gain: 0.14 }));
    });
  },
  error() {
    safeSound(() => {
      const audio = getCtx();
      if (!audio) return;
      tone(180, audio.currentTime, 0.22, { type: "sawtooth", gain: 0.12, glideTo: 90 });
    });
  },
  coin() {
    safeSound(() => {
      const audio = getCtx();
      if (!audio) return;
      const t = audio.currentTime;
      tone(988, t, 0.08, { type: "square", gain: 0.1 });
      tone(1319, t + 0.06, 0.12, { type: "square", gain: 0.1 });
    });
  },
  levelComplete() {
    safeSound(() => {
      const audio = getCtx();
      if (!audio) return;
      const t = audio.currentTime;
      [523.25, 659.25, 784.0, 1046.5].forEach((f, i) => tone(f, t + i * 0.12, 0.22, { type: "triangle", gain: 0.15 }));
    });
  },
  click() {
    safeSound(() => {
      const audio = getCtx();
      if (!audio) return;
      tone(300, audio.currentTime, 0.05, { type: "square", gain: 0.08 });
    });
  },
};
