import { apply } from '../src/engine/game';
import { checkInvariants } from '../src/engine/invariants';
import { newGame } from '../src/engine/state';
import { randomAction } from '../src/ai/random';
import type { Action, GameState } from '../src/engine/types';

const games = Number(process.argv[2] ?? 200);
const maxRounds = Number(process.argv[3] ?? 12);
const firstSeed = Number(process.argv[4] ?? 1);

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

interface Outcome { seed: number; rounds: number; actions: number; winner: string | null; failure?: string }

const coverage: Record<string, number> = {};
const hit = (k: string) => (coverage[k] = (coverage[k] ?? 0) + 1);

function observe(before: GameState, after: GameState, a: Action): void {
  if (a.type !== 'move' || after.phase !== before.phase) hit(`action:${a.type}`);
  if (before.pending) hit(`decision:${before.pending.kind}`);
  for (const b of after.battles) {
    const prev = before.battles.find((x) => x.id === b.id);
    if (!b.resolved || prev?.resolved) continue;
    hit(b.skipped ? 'battle:skipped' : `battle:${b.kind}:${b.winner}`);
    if (b.seaborne.length > 0) hit('battle:amphibious');
    if (b.dice.some((d) => d.label === 'bombardment')) hit('battle:bombardment');
    if (b.dice.some((d) => d.label === 'aa')) hit('battle:aaFire');
    if (b.dice.some((d) => d.label === 'surprise strike')) hit('battle:surpriseStrike');
    if (b.submerged.length > 0) hit('battle:submerged');
  }
  for (const line of after.log.slice(before.log.length > after.log.length ? 0 : before.log.length)) {
    if (line.includes('seizes')) hit('capital:captured');
    if (line.includes('liberates')) hit('territory:liberated');
    if (line.includes('retreats')) hit('battle:retreat');
    if (line.includes('nowhere to land')) hit('air:crashed');
    if (line.includes('stranded')) hit('air:strandedLost');
    if (line.includes('Raid')) hit('sbr:raid');
  }
  if (a.type === 'move' && a.path.length === 2 && before.units.find((u) => u.id === a.units[0])?.carriedBy) hit('move:offload');
  if (a.type === 'move' && after.units.find((u) => u.id === a.units[0])?.blitzed) hit('move:blitz');
}

function play(seed: number): Outcome {
  const rand = mulberry(seed * 7919);
  let s: GameState = newGame(seed);
  let phaseStart = s;
  const recent: Action[] = [];
  let actions = 0;
  let stuck = 0;
  while (!s.winner && s.round <= maxRounds) {
    if (++stuck > 4000) return { seed, rounds: s.round, actions, winner: null, failure: `no progress in ${s.power} ${s.phase}` };
    const a = randomAction(s, rand);
    let r;
    try {
      r = apply(s, a);
    } catch (e) {
      return { seed, rounds: s.round, actions, winner: null, failure: `threw on ${JSON.stringify(a)}: ${(e as Error).stack}\nrecent: ${JSON.stringify(recent.slice(-8))}` };
    }
    if (!r.ok) {
      if (a.type === 'endPhase' && s.phase === 'combatMove' && !s.pending) {
        s = phaseStart;
        const retry = apply(s, a);
        if (!retry.ok) return { seed, rounds: s.round, actions, winner: null, failure: `cannot end untouched combat move: ${retry.error}` };
        r = retry;
      } else return { seed, rounds: s.round, actions, winner: null, failure: `random agent produced illegal ${JSON.stringify(a)}: ${r.error} (${s.power} ${s.phase}, pending ${s.pending?.kind})` };
    }
    const before = s;
    s = r.state;
    observe(before, s, a);
    actions++;
    recent.push(a);
    if (s.phase !== before.phase || s.power !== before.power) {
      stuck = 0;
      if (s.phase === 'combatMove') phaseStart = s;
    }
    const v = checkInvariants(s);
    if (v.length > 0)
      return { seed, rounds: s.round, actions, winner: null, failure: `invariant after ${JSON.stringify(a)} (${before.power} ${before.phase}): ${v.slice(0, 5).join('; ')}\nrecent: ${JSON.stringify(recent.slice(-8))}` };
  }
  return { seed, rounds: s.round, actions, winner: s.winner };
}

const started = Date.now();
const failures: Outcome[] = [];
const wins = { Axis: 0, Allies: 0, none: 0 };
let totalActions = 0;
for (let seed = firstSeed; seed < firstSeed + games; seed++) {
  const o = play(seed);
  totalActions += o.actions;
  if (o.failure) {
    failures.push(o);
    if (failures.length <= 3) console.log(`seed ${seed} round ${o.rounds}: ${o.failure}\n`);
  } else wins[(o.winner ?? 'none') as keyof typeof wins]++;
}
console.log(`games=${games} failures=${failures.length} actions=${totalActions} wins=${JSON.stringify(wins)} seconds=${((Date.now() - started) / 1000).toFixed(1)}`);
console.log(Object.entries(coverage).sort().map(([k, n]) => `${k}=${n}`).join('\n'));
if (failures.length > 0) {
  console.log(`failing seeds: ${failures.map((f) => f.seed).join(' ')}`);
  process.exit(1);
}
