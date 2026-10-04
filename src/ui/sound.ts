import type { GameState } from '../engine/types';

export type Cue = 'drop' | 'dice' | 'hit' | 'capture' | 'turn' | 'victory';

const MUTE_KEY = 'aa1942.muted';
const rolls = (s: GameState) => s.battles.reduce((n, b) => n + b.dice.reduce((m, d) => m + d.rolls.length, 0), 0);

/** The sounds a change of state calls for, at most one of each, in the order they happened at the table. */
export function cuesBetween(prev: GameState, next: GameState): Cue[] {
  const out: Cue[] = [];
  if (rolls(next) > rolls(prev)) out.push('dice');
  const alive = new Set(next.units.map((u) => u.id));
  if (prev.units.some((u) => !alive.has(u.id) && u.type !== 'factory')) out.push('hit');
  if (Object.keys(next.owner).some((id) => next.owner[id] !== prev.owner[id])) out.push('capture');
  if (next.power !== prev.power) out.push('turn');
  if (next.winner && !prev.winner) out.push('victory');
  const was = new Map(prev.units.map((u) => [u.id, u.at]));
  if (out.length === 0 && next.units.some((u) => was.get(u.id) !== u.at)) out.push('drop');
  return out;
}

let muted = (() => {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
})();

export const isMuted = () => muted;

export function setMuted(m: boolean): void {
  muted = m;
  try {
    localStorage.setItem(MUTE_KEY, m ? '1' : '0');
  } catch {
    // The choice still holds until the page reloads.
  }
}

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(a: AudioContext, freq: number, at: number, dur: number, vol: number, type: OscillatorType = 'sine', slide = freq) {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  o.frequency.exponentialRampToValueAtTime(slide, at + dur);
  g.gain.setValueAtTime(vol, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(a.destination);
  o.start(at);
  o.stop(at + dur);
}

function noise(a: AudioContext, at: number, dur: number, vol: number, filter: BiquadFilterType, freq: number) {
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  const f = a.createBiquadFilter();
  const g = a.createGain();
  src.buffer = buf;
  f.type = filter;
  f.frequency.value = freq;
  g.gain.setValueAtTime(vol, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f).connect(g).connect(a.destination);
  src.start(at);
}

const VOICES: Record<Cue, (a: AudioContext, t: number) => void> = {
  drop: (a, t) => tone(a, 220, t, 0.09, 0.12, 'sine', 110),
  dice: (a, t) => {
    for (let i = 0; i < 6; i++)
      noise(a, t + i * 0.045 + Math.random() * 0.02, 0.035, 0.18, 'bandpass', 2400 + Math.random() * 1200);
  },
  hit: (a, t) => {
    noise(a, t, 0.55, 0.35, 'lowpass', 420);
    tone(a, 90, t, 0.4, 0.3, 'sine', 40);
  },
  capture: (a, t) => {
    tone(a, 523, t, 0.14, 0.12, 'triangle');
    tone(a, 784, t + 0.12, 0.22, 0.12, 'triangle');
  },
  turn: (a, t) => {
    tone(a, 880, t, 0.7, 0.08);
    tone(a, 1320, t, 0.5, 0.03);
  },
  victory: (a, t) => [523, 659, 784, 1047].forEach((f, i) => tone(a, f, t + i * 0.13, 0.5, 0.12, 'triangle')),
};

/** Plays cues in sequence, a beat apart, so a roll that kills and captures reads as dice, then the blast, then the flag. */
export function play(cues: Cue[]): void {
  if (muted || cues.length === 0) return;
  const a = audio();
  if (!a) return;
  cues.forEach((c, i) => VOICES[c](a, a.currentTime + i * 0.18));
}
