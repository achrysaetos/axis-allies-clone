import { asCombatants, simulate } from '../ai/eval';
import { STATS, isLand, space } from '../engine/data';
import { areAllied } from '../engine/queries';
import type { GameState, SpaceId, Unit } from '../engine/types';

export interface Forecast {
  space: SpaceId;
  kind: 'land' | 'sea';
  /** Chance the attacker clears the space (and, on land, can take it). */
  win: number;
  /** Expected IPC value lost by the attacker and by the defender. */
  attLoss: number;
  defLoss: number;
}

const TRIALS = 400;
const isCargo = (u: Unit) => u.carriedBy !== null && isLand(u.type);

/** Odds for every attack the moving power has committed to, before its dice are rolled. */
export function forecasts(state: GameState): Forecast[] {
  if (state.phase !== 'combatMove' && state.phase !== 'combat') return [];
  const power = state.power;
  const started = new Set(state.battles.filter((b) => b.round > 0 || b.resolved || b.id === state.activeBattle).map((b) => b.space));
  const landing = state.units.filter((u) => u.owner === power && isCargo(u) && u.offloadedTo !== null);
  const spaces = new Set([...state.units.filter((u) => u.owner === power && !isCargo(u)).map((u) => u.at), ...landing.map((u) => u.offloadedTo!)]);
  const out: Forecast[] = [];
  for (const id of [...spaces].sort()) {
    if (started.has(id)) continue;
    const water = space(id).water;
    const here = state.units.filter((u) => u.at === id);
    const defenders = here.filter((u) => !areAllied(u.owner, power) && u.type !== 'factory' && !isCargo(u));
    const attackers = water
      ? here.filter((u) => u.owner === power && u.carriedBy === null && !u.sbr)
      : [...here.filter((u) => u.owner === power && u.movedInCombat && !u.sbr && u.carriedBy === null), ...landing.filter((u) => u.offloadedTo === id)];
    if (attackers.length === 0 || defenders.length === 0) continue;
    const odds = simulate({
      kind: water ? 'sea' : 'land',
      attackers: asCombatants(attackers),
      defenders: asCombatants(defenders),
      bombard: water ? [] : bombardment(state, landing.filter((u) => u.offloadedTo === id)),
      trials: TRIALS,
    });
    out.push({ space: id, kind: water ? 'sea' : 'land', ...odds });
  }
  return out;
}

/** Attack values of ships that can bombard, one per landing unit, from zones with no sea battle. */
function bombardment(state: GameState, landing: Unit[]): number[] {
  const zones = new Set(landing.map((u) => u.at));
  const contested = (zone: SpaceId) => state.units.some((u) => u.at === zone && !areAllied(u.owner, state.power));
  return state.units
    .filter((u) => u.owner === state.power && (u.type === 'battleship' || u.type === 'cruiser') && zones.has(u.at) && !contested(u.at) && !u.bombarded)
    .slice(0, landing.length)
    .map((u) => STATS[u.type].attack);
}

export const oddsClass = (win: number) => (win >= 0.7 ? 'good' : win >= 0.4 ? 'warn' : 'bad');
