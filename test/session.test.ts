import { describe, expect, it } from 'vitest';
import { newGame } from '../src/engine/state';
import { act, newSession, parseSession, quickResolve } from '../src/ui/session';
import { space } from '../src/engine/data';
import { sinceLastTurn } from '../src/ui/panels/TurnCard';
import { POWERS } from '../src/engine/types';
import { ids, move, ok, scenario } from './helpers';

describe('saved games', () => {
  it('older saves load with fields added since they were written', () => {
    const state = newGame(1) as unknown as Record<string, unknown>;
    delete state.hostileSeaAtTurnStart;
    delete state.mobilized;
    state.battles = [{ id: 1, space: 'France', dice: [{ side: 'attacker', label: 'any', rolls: [3], hits: 1 }] }];
    const s = parseSession(JSON.stringify({ version: 1, state, controllers: {} }));
    if (typeof s === 'string') throw new Error(s);
    expect(s.state.mobilized).toEqual([]);
    expect(s.state.hostileSeaAtTurnStart).toEqual([]);
    expect(s.state.battles[0]!.dice[0]!).toMatchObject({ round: 1, targets: [] });
    expect(s.controllers.Germans).toBe('human');
  });

  it('rejects files that are not saved games', () => {
    expect(parseSession('{"hello":1}')).toMatch(/not a saved game/);
    expect(parseSession('nope')).toMatch(/not a JSON file/);
  });
});

describe('quick resolve', () => {
  it('retreats an attack whose chance has fallen below the threshold', () => {
    let s = scenario({
      units: [
        ['Germans', 'armour', 'West Russia'],
        ['Russians', 'infantry', 'Archangel', 6],
      ],
      dice: [6, 6, 6, 6, 6, 6, 6],
    });
    s = move(s, ids(s, 'Germans', 'armour', 'West Russia'), ['West Russia', 'Archangel']);
    s = ok(s, { type: 'endPhase' });
    const session = newSession(s, Object.fromEntries(POWERS.map((p) => [p, 'human'])) as Parameters<typeof newSession>[1]);
    const r = quickResolve(session, s.battles[0]!.id);
    if (!r.ok) throw new Error(r.error);
    expect(r.session.state.units.find((u) => u.type === 'armour')!.at).toBe('West Russia');
    expect(r.session.state.battles[0]!.round).toBe(1);
  });

  it('fights a battle to the end with default choices for both sides', () => {
    let s = scenario({
      units: [
        ['Germans', 'armour', 'West Russia', 3],
        ['Germans', 'infantry', 'West Russia', 2],
        ['Russians', 'infantry', 'Archangel', 3],
      ],
    });
    s = move(
      s,
      [...ids(s, 'Germans', 'armour', 'West Russia'), ...ids(s, 'Germans', 'infantry', 'West Russia')],
      ['West Russia', 'Archangel'],
    );
    s = ok(s, { type: 'endPhase' });
    const session = newSession(s, Object.fromEntries(POWERS.map((p) => [p, 'human'])) as Parameters<typeof newSession>[1]);
    const r = quickResolve(session, s.battles[0]!.id);
    if (!r.ok) throw new Error(r.error);
    expect(r.session.state.battles[0]!.resolved).toBe(true);
    expect(r.session.state.pending).toBeNull();
    expect(r.session.state.battles[0]!.dice.length).toBeGreaterThan(0);
  });
});

describe('turn recap', () => {
  it('covers everything since this power last ended a turn', () => {
    const log = [
      'Germans captures Karelia S.S.R.',
      'Russians collects 20 IPCs',
      'Germans wins the battle for West Russia. Losses: Russians 2 infantry',
      'Germans collects 40 IPCs',
      'British bombs Germany for 4 damage, losing 0 bombers',
      'British collects 31 IPCs',
    ];
    expect(sinceLastTurn(log, 'Russians')).toEqual([log[2], log[4]]);
    expect(sinceLastTurn(log.slice(0, 1), 'Russians')).toEqual([log[0]]);
  });
});

describe('shore bombardment', () => {
  it('fires the strongest eligible ship without asking, since bombarding never costs anything', () => {
    const zone = space('France').neighbors.find((n) => space(n).water && space(n).neighbors.includes('United Kingdom'))!;
    let s = scenario({
      power: 'British',
      units: [
        ['British', 'transport', zone],
        ['British', 'battleship', zone],
        ['British', 'cruiser', zone],
        ['British', 'infantry', 'United Kingdom'],
        ['Germans', 'infantry', 'France'],
      ],
    });
    s = move(s, ids(s, 'British', 'infantry', 'United Kingdom'), ['United Kingdom', zone]);
    s = move(s, ids(s, 'British', 'infantry', zone), [zone, 'France']);
    s = ok(s, { type: 'endPhase' });
    const battle = s.battles.find((b) => b.space === 'France')!;

    const r = act(newSession(s, Object.fromEntries(POWERS.map((p) => [p, 'human'])) as never), {
      type: 'startBattle',
      battle: battle.id,
    });

    if (!r.ok) throw new Error(r.error);
    expect(r.session.state.pending?.kind).not.toBe('bombard');
    const fired = r.session.state.units.filter((u) => u.bombarded).map((u) => u.type);
    expect(fired).toEqual(['battleship']);
  });
});
