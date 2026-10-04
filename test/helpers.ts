import { expect } from 'vitest';
import { apply } from '../src/engine/game';
import { autoCasualties } from '../src/engine/casualties';
import { freshUnit, newGame } from '../src/engine/state';
import type { Action, GameState, Phase, Power, SpaceId, Unit, UnitType } from '../src/engine/types';

export type Placement = [Power, UnitType, SpaceId, number?];

export interface ScenarioOptions {
  power?: Power;
  phase?: Phase;
  owners?: Record<SpaceId, Power>;
  units: Placement[];
  treasury?: Partial<Record<Power, number>>;
  dice?: number[];
  keepSetup?: boolean;
}

/** The real map with an empty board, so each test sets up only the units its rule needs. */
export function scenario(o: ScenarioOptions): GameState {
  const s = newGame(7);
  if (!o.keepSetup) s.units = [];
  Object.assign(s.owner, o.owners ?? {});
  s.ownerAtTurnStart = { ...s.owner };
  s.power = o.power ?? 'Germans';
  s.phase = o.phase ?? 'combatMove';
  for (const [owner, type, at, count = 1] of o.units)
    for (let i = 0; i < count; i++) s.units.push(freshUnit(s.nextUnitId++, type, owner, at));
  Object.assign(s.treasury, o.treasury ?? {});
  s.scriptedDice = [...(o.dice ?? [])];
  return s;
}

export function ok(s: GameState, a: Action): GameState {
  const r = apply(s, a);
  if (!r.ok) throw new Error(`expected ${a.type} to succeed: ${r.error}`);
  return r.state;
}

export function fails(s: GameState, a: Action, match?: RegExp): string {
  const r = apply(s, a);
  expect(r.ok, `expected ${JSON.stringify(a)} to fail`).toBe(false);
  if (r.ok) throw new Error('unreachable');
  if (match) expect(r.error).toMatch(match);
  return r.error;
}

export const ids = (s: GameState, owner: Power, type: UnitType, at: SpaceId) =>
  s.units.filter((u) => u.owner === owner && u.type === type && u.at === at).map((u) => u.id);

export const count = (s: GameState, owner: Power, type: UnitType, at: SpaceId) => ids(s, owner, type, at).length;

export const move = (s: GameState, units: number[], path: SpaceId[], extra: Partial<Extract<Action, { type: 'move' }>> = {}) =>
  ok(s, { type: 'move', units, path, ...extra });

/** Answer every pending decision with the engine's default choice until none remain. */
export function autoResolve(s: GameState, choices: { retreat?: SpaceId | null; submerge?: boolean } = {}): GameState {
  let cur = s;
  for (let i = 0; i < 500 && cur.pending; i++) {
    const d = cur.pending;
    switch (d.kind) {
      case 'casualties': {
        const b = cur.battles.find((x) => x.id === d.battle)!;
        const pool = poolFor(cur, b.id, d.side);
        cur = ok(cur, { type: 'casualties', units: autoCasualties(d.groups, pool) });
        break;
      }
      case 'submerge':
        cur = ok(cur, { type: 'submerge', units: choices.submerge ? d.subs : [] });
        break;
      case 'retreat':
        cur = ok(cur, { type: 'retreat', to: choices.retreat === undefined ? null : choices.retreat });
        break;
      case 'bombard':
        cur = ok(cur, { type: 'bombard', ships: d.ships.slice(0, d.max) });
        break;
      case 'landStranded':
        cur = ok(cur, {
          type: 'landStranded',
          landings: Object.fromEntries(d.fighters.map((f) => [f, d.options[f]![0] ?? null])),
        });
        break;
    }
  }
  return cur;
}

export function poolFor(s: GameState, battleId: number, side: 'attacker' | 'defender'): Unit[] {
  const b = s.battles.find((x) => x.id === battleId)!;
  const list = side === 'attacker' ? b.attackers : b.defenders;
  return s.units.filter((u) => list.includes(u.id) && !b.submerged.includes(u.id) && !b.doomed.includes(u.id));
}

/** End combat move and fight the one battle at `space` with default choices. */
export function fight(s: GameState, space: SpaceId, choices: Parameters<typeof autoResolve>[1] = {}): GameState {
  let cur = s.phase === 'combatMove' ? ok(s, { type: 'endPhase' }) : s;
  const b = cur.battles.find((x) => x.space === space && !x.resolved);
  if (!b) throw new Error(`no battle in ${space}: ${cur.battles.map((x) => x.space).join(', ')}`);
  cur = ok(cur, { type: 'startBattle', battle: b.id });
  return autoResolve(cur, choices);
}
