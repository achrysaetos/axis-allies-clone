import { SIDE, VICTORY_CITIES, space } from '../src/engine/data';
import { actingPower, apply } from '../src/engine/game';
import { checkInvariants } from '../src/engine/invariants';
import { newGame } from '../src/engine/state';
import { aiAction } from '../src/ai';
import { randomAction } from '../src/ai/random';
import type { Action, GameState, Side } from '../src/engine/types';

/**
 * Usage: tsx scripts/ai-match.ts [games] [maxRounds] [firstSeed] [mode]
 * mode: "ai" (all five powers AI), "axis" (AI Axis vs random Allies), "allies" (AI Allies vs random Axis), "both" (axis then allies), "all" (every mode).
 */
const games = Number(process.argv[2] ?? 6);
const maxRounds = Number(process.argv[3] ?? 15);
const firstSeed = Number(process.argv[4] ?? 1);
const mode = process.argv[5] ?? 'all';

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Outcome {
  seed: number;
  rounds: number;
  winner: Side | null;
  /** Side ahead on victory cities, then income, when nobody has won. */
  leader: Side;
  failure?: string;
  aiCalls: number;
  aiMs: number;
  slowest: number;
  /** Aircraft of AI-controlled powers lost for lack of a landing. */
  crashed: number;
}

const VICTORY = new Set(VICTORY_CITIES);

function leaderOf(s: GameState): Side {
  const vc = (side: Side) => Object.entries(s.owner).filter(([id, o]) => SIDE[o] === side && VICTORY.has(id)).length;
  const ipc = (side: Side) => Object.entries(s.owner).reduce((n, [id, o]) => n + (SIDE[o] === side ? space(id).ipc : 0), 0);
  const diff = vc('Axis') - vc('Allies') || ipc('Axis') - ipc('Allies');
  return diff > 0 ? 'Axis' : 'Allies';
}

function play(seed: number, aiSide: Side | 'both'): Outcome {
  const rand = mulberry(seed * 7919);
  let s: GameState = newGame(seed);
  let aiCalls = 0;
  let aiMs = 0;
  let slowest = 0;
  let steps = 0;
  let crashed = 0;
  const recent: Action[] = [];
  let phaseStart = s;
  while (!s.winner && s.round <= maxRounds) {
    if (++steps > 200000) return { seed, rounds: s.round, winner: null, leader: leaderOf(s), failure: 'no progress', aiCalls, aiMs, slowest, crashed };
    const actor = actingPower(s);
    const byAi = aiSide === 'both' || SIDE[actor] === aiSide;
    let a: Action;
    if (byAi) {
      const t0 = performance.now();
      try {
        a = aiAction(s);
      } catch (e) {
        return { seed, rounds: s.round, winner: null, leader: leaderOf(s), failure: `AI threw: ${(e as Error).message}`, aiCalls, aiMs, slowest, crashed };
      }
      const ms = performance.now() - t0;
      aiCalls++;
      aiMs += ms;
      slowest = Math.max(slowest, ms);
    } else a = randomAction(s, rand);
    const r = apply(s, a);
    if (!r.ok) {
      if (!byAi && a.type === 'endPhase' && s.phase === 'combatMove') {
        // The random agent cannot undo combat moves; restart its combat move from scratch.
        const retry = apply(phaseStart, a);
        if (retry.ok) {
          s = retry.state;
          continue;
        }
      }
      const who = byAi ? 'AI' : 'random';
      return { seed, rounds: s.round, winner: null, leader: leaderOf(s), failure: `${who} illegal ${JSON.stringify(a)}: ${r.error} (${s.power} ${s.phase})\nrecent: ${JSON.stringify(recent.slice(-5))}`, aiCalls, aiMs, slowest, crashed };
    }
    const before = s;
    s = r.state;
    const aiTurn = aiSide === 'both' || SIDE[before.power] === aiSide;
    if (aiTurn && a.type === 'endPhase' && before.phase === 'mobilize') {
      const line = s.log.slice(-4).find((l) => l.includes(`${before.power} air units had nowhere to land`));
      if (line) crashed += Number(line.split(' ')[0]);
    }
    recent.push(a);
    if (s.phase === 'combatMove' && before.phase !== 'combatMove') phaseStart = s;
    const v = checkInvariants(s);
    if (v.length > 0)
      return { seed, rounds: s.round, winner: null, leader: leaderOf(s), failure: `invariant after ${JSON.stringify(a)} (${before.power} ${before.phase}): ${v.slice(0, 3).join('; ')}`, aiCalls, aiMs, slowest, crashed };
  }
  return { seed, rounds: Math.min(s.round, maxRounds), winner: s.winner, leader: leaderOf(s), aiCalls, aiMs, slowest, crashed };
}

function report(label: string, aiSide: Side | 'both'): void {
  const started = Date.now();
  const outcomes: Outcome[] = [];
  for (let seed = firstSeed; seed < firstSeed + games; seed++) outcomes.push(play(seed, aiSide));
  const failures = outcomes.filter((o) => o.failure);
  const wins = { Axis: 0, Allies: 0, none: 0 };
  const leads = { Axis: 0, Allies: 0 };
  for (const o of outcomes.filter((x) => !x.failure)) {
    wins[o.winner ?? 'none']++;
    if (!o.winner) leads[o.leader]++;
  }
  const calls = outcomes.reduce((n, o) => n + o.aiCalls, 0);
  const ms = outcomes.reduce((n, o) => n + o.aiMs, 0);
  const crashed = outcomes.reduce((n, o) => n + o.crashed, 0);
  const avgRounds = outcomes.reduce((n, o) => n + o.rounds, 0) / outcomes.length;
  console.log(
    `${label}: games=${games} wins=${JSON.stringify(wins)} undecidedLeader=${JSON.stringify(leads)} avgRounds=${avgRounds.toFixed(1)} ` +
      `aiCalls=${calls} avgMsPerAiAction=${(ms / Math.max(1, calls)).toFixed(2)} slowestMs=${Math.max(...outcomes.map((o) => o.slowest)).toFixed(0)} ` +
      `aiAircraftCrashed=${crashed} failures=${failures.length} seconds=${((Date.now() - started) / 1000).toFixed(1)}`,
  );
  for (const f of failures.slice(0, 3)) console.log(`  seed ${f.seed} round ${f.rounds}: ${f.failure}`);
  if (failures.length > 0) process.exitCode = 1;
}

if (mode === 'ai' || mode === 'all') report('AI vs AI', 'both');
if (mode === 'axis' || mode === 'both' || mode === 'all') report('AI Axis vs random Allies', 'Axis');
if (mode === 'allies' || mode === 'both' || mode === 'all') report('AI Allies vs random Axis', 'Allies');
