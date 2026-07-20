/**
 * Lightweight Web Audio synthesizer — no external assets required.
 * Educational sim SFX: takeoff, tick thruster, cash-out ding, crash whoosh.
 */

type Sfx = 'takeoff' | 'cashout' | 'crash' | 'bet' | 'tick' | 'countdown';

let ctx: AudioContext | null = null;
/** SSR-safe default — must match initial client render before hydrate() */
let muted = false;
let engineOsc: OscillatorNode | null = null;
let engineGain: GainNode | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

export function loadMutePreference(): boolean {
  // Same default on server and first client paint (avoid hydration mismatch)
  if (typeof window === 'undefined') return false;
  const v = localStorage.getItem('aviator_muted');
  if (v === null) return false;
  return v === '1';
}

export function setMuted(next: boolean) {
  muted = next;
  if (typeof window !== 'undefined') {
    localStorage.setItem('aviator_muted', next ? '1' : '0');
  }
  if (next) stopEngine();
}

export function isMuted() {
  return muted;
}

export function initSoundFromStorage() {
  muted = loadMutePreference();
}

/** Unlock audio on first user gesture */
export async function unlockAudio() {
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') {
    try {
      await c.resume();
    } catch {
      /* ignore */
    }
  }
}

function tone(
  freq: number,
  duration: number,
  type: OscillatorType = 'sine',
  gain = 0.08,
  slideTo?: number,
) {
  const c = getCtx();
  if (!c || muted) return;
  const t0 = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo != null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + duration);
  }
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

function noiseBurst(duration: number, gain = 0.06) {
  const c = getCtx();
  if (!c || muted) return;
  const len = Math.floor(c.sampleRate * duration);
  const buffer = c.createBuffer(1, len, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buffer;
  const g = c.createGain();
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1200;
  g.gain.value = gain;
  src.connect(filter);
  filter.connect(g);
  g.connect(c.destination);
  src.start();
}

export function playSfx(name: Sfx) {
  if (muted) return;
  void unlockAudio();
  switch (name) {
    case 'bet':
      tone(520, 0.08, 'triangle', 0.05);
      tone(780, 0.1, 'triangle', 0.04);
      break;
    case 'takeoff':
      tone(180, 0.35, 'sawtooth', 0.04, 420);
      noiseBurst(0.2, 0.04);
      startEngine();
      break;
    case 'cashout':
      tone(660, 0.1, 'sine', 0.07);
      setTimeout(() => tone(990, 0.14, 'sine', 0.06), 70);
      break;
    case 'crash':
      stopEngine();
      noiseBurst(0.35, 0.09);
      tone(320, 0.4, 'sawtooth', 0.05, 60);
      break;
    case 'countdown':
      tone(440, 0.06, 'square', 0.03);
      break;
    case 'tick':
      tone(200, 0.03, 'sine', 0.015);
      break;
  }
}

export function startEngine() {
  const c = getCtx();
  if (!c || muted) return;
  stopEngine();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = 'sawtooth';
  osc.frequency.value = 90;
  g.gain.value = 0.012;
  osc.connect(g);
  g.connect(c.destination);
  osc.start();
  engineOsc = osc;
  engineGain = g;
}

export function stopEngine() {
  try {
    engineOsc?.stop();
  } catch {
    /* ignore */
  }
  engineOsc = null;
  engineGain = null;
}

export function onPhaseChange(phase: string, prev: string | null) {
  if (phase === prev) return;
  if (phase === 'FLYING' && prev !== 'FLYING') playSfx('takeoff');
  if (phase === 'CRASHED' && prev !== 'CRASHED') playSfx('crash');
  if (phase === 'COUNTDOWN' && prev === 'WAITING') playSfx('countdown');
  if (phase === 'WAITING' || phase === 'CRASHED') stopEngine();
}
