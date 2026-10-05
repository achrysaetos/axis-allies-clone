import { describe, expect, it } from 'vitest';
import { computerTurn, handle, newRoom, view } from '../worker/room';
import type { RoomRecord } from '../worker/room';
import { apply } from '../src/engine/game';
import { freshUnit } from '../src/engine/state';
import { POWERS } from '../src/engine/types';
import type { Action, GameState, Power, UnitType } from '../src/engine/types';
import type { ClientMsg, PlayerId } from '../src/net/protocol';
import { autoResolve, fails, ids, move, ok, scenario } from './helpers';

const nobody = new Set<PlayerId>();

function accepted(r: RoomRecord, me: PlayerId | null, msg: ClientMsg): RoomRecord {
  const out = handle(r, me, msg, nobody);
  if (out.error) throw new Error(`expected ${msg.t} to be accepted: ${out.error}`);
  return out.record;
}

function seated(powers: Power[], seed = 1942, options = {}): { r: RoomRecord; me: PlayerId; them: PlayerId } {
  let r = newRoom('abcdefghij', seed, options);
  const a = handle(r, null, { t: 'join', name: 'Alex' }, nobody);
  r = a.record;
  const me = (a.reply as { player: PlayerId }).player;
  const b = handle(r, null, { t: 'join', name: 'Bea' }, nobody);
  r = b.record;
  const them = (b.reply as { player: PlayerId }).player;
  for (const p of POWERS) r = accepted(r, powers.includes(p) ? me : them, { t: 'seat', power: p, to: 'me' });
  return { r, me, them };
}

const act = (r: RoomRecord, me: PlayerId, ...actions: Action[]) =>
  handle(r, me, { t: 'act', version: r.version, actions }, nobody);

describe('client-supplied data reaching the engine', () => {
  it('a purchase of a unit type that does not exist is refused, so the treasury cannot become NaN', () => {
    const { r, me } = seated(['Russians']);
    const bogus = { type: 'constructor' as UnitType, count: 1 };
    const out = act(r, me, { type: 'buy', purchases: [bogus, { type: 'armour', count: 8 }] });
    expect(out.error, 'bought 8 tanks (48 IPCs) with 24 IPCs by adding a bogus line').toBeDefined();
    const after = out.error
      ? r
      : accepted(out.record, me, { t: 'act', version: out.record.version, actions: [{ type: 'endPhase' }] });
    expect(Number.isFinite(after.session.state.treasury.Russians)).toBe(true);
  });

  it('an interceptor named twice still rolls one die', () => {
    let s = scenario({
      power: 'British',
      owners: { 'Northwestern Europe': 'British' },
      units: [
        ['British', 'bomber', 'United Kingdom'],
        ['Germans', 'factory', 'Germany'],
        ['Germans', 'fighter', 'Germany'],
      ],
      dice: [6, 6, 6, 6, 6, 6, 6, 6, 6, 6],
    });
    s.options.sbrEscortsInterceptors = true;
    s = move(s, ids(s, 'British', 'bomber', 'United Kingdom'), ['United Kingdom', '6 Sea Zone', '5 Sea Zone', 'Germany'], {
      sbr: true,
    });
    s = ok(s, { type: 'endPhase' });
    s = ok(s, { type: 'startBattle', battle: s.battles.find((b) => b.space === 'Germany')!.id });
    expect(s.pending).toMatchObject({ kind: 'intercept' });
    const [f] = ids(s, 'Germans', 'fighter', 'Germany');
    const r = apply(s, { type: 'intercept', units: [f!, f!, f!] });
    if (!r.ok) return;
    const fired = autoResolve(r.state)
      .battles.find((b) => b.space === 'Germany')!
      .dice.find((d) => d.label === 'interceptor fire');
    expect(fired?.rolls.length ?? 0, 'one fighter rolled several interceptor dice').toBeLessThanOrEqual(1);
  });

  it('a battleship named twice in place of the cruiser does not bombard twice (engine level; the session auto-bombards first)', () => {
    let s = scenario({
      power: 'British',
      units: [
        ['British', 'transport', '8 Sea Zone'],
        ['British', 'battleship', '8 Sea Zone'],
        ['British', 'cruiser', '8 Sea Zone'],
        ['Germans', 'infantry', 'France'],
      ],
    });
    const t = s.units.find((u) => u.type === 'transport')!;
    for (let i = 0; i < 2; i++) {
      const u = freshUnit(s.nextUnitId++, 'infantry', 'British', '8 Sea Zone');
      u.carriedBy = t.id;
      s.units.push(u);
    }
    s = move(s, ids(s, 'British', 'infantry', '8 Sea Zone'), ['8 Sea Zone', 'France']);
    s = ok(s, { type: 'endPhase' });
    s = ok(s, { type: 'startBattle', battle: s.battles.find((b) => b.space === 'France')!.id });
    expect(s.pending).toMatchObject({ kind: 'bombard', max: 2 });
    const [bb] = ids(s, 'British', 'battleship', '8 Sea Zone');
    fails(s, { type: 'bombard', ships: [bb!, bb!] });
  });
});

describe('who may act online', () => {
  it('only the holder of the acting power acts, and only on the current version', () => {
    const { r, me, them } = seated(['Germans']);
    expect(act(r, me, { type: 'endPhase' }).error).toMatch(/not your move/);
    const moved = accepted(r, them, { t: 'act', version: r.version, actions: [{ type: 'endPhase' }] });
    expect(handle(moved, them, { t: 'act', version: r.version, actions: [{ type: 'endPhase' }] }, nobody).error).toMatch(
      /moved on/,
    );
  });

  it('the view hides the dice generator', () => {
    const { r } = seated(['Germans']);
    expect(view(r, nobody).state.rng).toBe(0);
    expect(view(r, nobody).state.scriptedDice).toEqual([]);
  });

  it('undo never reaches back across a battle', () => {
    const { r, me } = seated(['Germans']);
    let rec = r;
    const state = (): GameState => rec.session.state;
    while (state().power !== 'Germans') {
      const out = computerTurnFor(rec);
      rec = out;
    }
    expect(state().phase).toBe('purchase');
    rec = accepted(rec, me, { t: 'act', version: rec.version, actions: [{ type: 'endPhase' }] });
    expect(handle(rec, me, { t: 'undo', version: rec.version }, nobody).error).toMatch(/nothing to undo/);
  });
});

/** Hands every non-German seat to the computer until the Germans are to move. */
function computerTurnFor(r: RoomRecord): RoomRecord {
  const seats = { ...r.seats };
  for (const p of POWERS) if (p !== 'Germans') seats[p] = 'computer';
  const out = computerTurn({ ...r, seats }, 1000);
  if (!out || out.error) throw new Error(`computer could not move: ${out?.error}`);
  return { ...out.record, seats: r.seats };
}

describe('the online computer', () => {
  it.each([1, 2, 3])(
    'plays two rounds of an all-computer room in six-action bursts without getting stuck (seed %i)',
    (seed) => {
      let r = newRoom('abcdefghij', seed, {}, POWERS);
      const stuck: string[] = [];
      for (let i = 0; i < 4000 && r.session.state.round <= 2 && !r.session.state.winner; i++) {
        const out = computerTurn(r, 6);
        if (!out) break;
        if (out.error) {
          stuck.push(`${out.record.session.state.power} ${out.record.session.state.phase}: ${out.error}`);
          break;
        }
        r = out.record;
      }
      expect(stuck).toEqual([]);
      expect(r.session.state.round).toBeGreaterThan(2);
    },
    120_000,
  );
});
