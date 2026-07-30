// Sound Design -- no audio asset pipeline exists in this project, so every
// effect here is synthesized procedurally via the Web Audio API (oscillators +
// noise buffers) rather than shipped as sound files. Browsers require a user
// gesture before audio can start, so the AudioContext is created lazily on the
// first click/keydown rather than at page load.
const SOUND_DISABLED_KEY = "blackwell_sound_disabled";
let audioCtx = null;

function soundEnabled() {
  return localStorage.getItem(SOUND_DISABLED_KEY) !== "1";
}

function getAudioContext() {
  if (!soundEnabled()) return null;
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function playTone(freqStart, freqEnd, durationMs, type, volume) {
  const ctx = getAudioContext();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freqStart, ctx.currentTime);
  if (freqEnd !== freqStart) osc.frequency.linearRampToValueAtTime(freqEnd, ctx.currentTime + durationMs / 1000);
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + durationMs / 1000);
}

// 🔔 Clochette de Bourse -- a big deal closing.
function playBellSound() {
  playTone(880, 1320, 350, "sine", 0.12);
  setTimeout(() => playTone(1320, 1760, 300, "sine", 0.08), 120);
}

// 🚨 Bip d'urgence -- a Risk alert (margin call, kill switch, war room, audit).
function playAlertBeep() {
  playTone(660, 660, 120, "square", 0.1);
  setTimeout(() => playTone(660, 660, 120, "square", 0.1), 180);
}

// 📎 Bruit de tampon/papier -- an HR hire.
function playStampSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const bufferSize = ctx.sampleRate * 0.08;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 400;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.25, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  noise.start();
}

// Ambient trading-floor hum -- a very quiet, looping filtered noise bed. Started
// on demand (e.g. entering the Marchés page) rather than at load, both because
// autoplay needs a gesture and because it shouldn't run on every page.
let ambienceNodes = null;

function startTradingFloorAmbience() {
  const ctx = getAudioContext();
  if (!ctx || ambienceNodes) return;
  const bufferSize = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.5;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 800;
  const gain = ctx.createGain();
  gain.gain.value = 0.015;
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  noise.start();
  ambienceNodes = { noise, gain };
}

function stopTradingFloorAmbience() {
  if (!ambienceNodes) return;
  ambienceNodes.noise.stop();
  ambienceNodes = null;
}
