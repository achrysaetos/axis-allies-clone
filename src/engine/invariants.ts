import { CARRIER_CAPACITY, STATS, TRANSPORT_CAPACITY, isAir, isLand, isNeutral, isSea, space } from './data';
import { areAllied, canLandAir, transportLoad } from './queries';
import type { GameState } from './types';

/** Facts that must hold after every action; returns human-readable violations. */
export function checkInvariants(s: GameState): string[] {
  const v: string[] = [];
  const ids = new Set<number>();
  const byId = new Map(s.units.map((u) => [u.id, u]));
  for (const u of s.units) {
    if (ids.has(u.id)) v.push(`duplicate unit id ${u.id}`);
    ids.add(u.id);
    const water = space(u.at).water;
    if (isNeutral(u.at)) v.push(`${u.type}#${u.id} in neutral ${u.at}`);
    if (isSea(u.type) && !water) v.push(`${u.type}#${u.id} on land ${u.at}`);
    if ((isLand(u.type) || u.type === 'factory') && water && u.carriedBy === null) v.push(`${u.type}#${u.id} adrift in ${u.at}`);
    if (u.type === 'factory' && u.damage > 2 * space(u.at).ipc) v.push(`factory in ${u.at} over-damaged`);
    if (u.type === 'factory' && s.owner[u.at] !== u.owner) v.push(`factory in ${u.at} owned by ${u.owner} but territory by ${s.owner[u.at]}`);
    if (u.moved > STATS[u.type].move) v.push(`${u.type}#${u.id} moved ${u.moved}`);
    if (u.carriedBy !== null) {
      const c = byId.get(u.carriedBy);
      if (!c) v.push(`${u.type}#${u.id} carried by missing unit`);
      else if (c.at !== u.at) v.push(`${u.type}#${u.id} not with its carrier`);
      else if (isLand(u.type) && c.type !== 'transport') v.push(`${u.type}#${u.id} carried by ${c.type}`);
      else if (isAir(u.type) && c.type !== 'carrier') v.push(`${u.type}#${u.id} carried by ${c.type}`);
      else if (!areAllied(c.owner, u.owner)) v.push(`${u.type}#${u.id} carried by an enemy`);
    }
    if (u.type === 'transport' && transportLoad(s, u.id) > TRANSPORT_CAPACITY) v.push(`transport#${u.id} overloaded`);
    if (u.type === 'carrier' && s.units.filter((x) => x.carriedBy === u.id).length > CARRIER_CAPACITY)
      v.push(`carrier#${u.id} overloaded`);
  }
  for (const p of Object.keys(s.treasury) as (keyof typeof s.treasury)[])
    if (s.treasury[p] < 0) v.push(`${p} treasury negative`);
  if (s.phase !== 'combat' && s.activeBattle !== null) v.push('active battle outside combat');
  if (s.pending && s.pending.kind !== 'landStranded' && s.phase !== 'combat') v.push('battle decision outside combat');
  if (s.phase === 'purchase' && s.pending === null) v.push(...turnBoundary(s));
  return v;
}

/** Facts that hold between turns: land is never shared by enemies and the last player's aircraft have landed. */
function turnBoundary(s: GameState): string[] {
  const v: string[] = [];
  const byLand = new Map<string, Set<string>>();
  for (const u of s.units) {
    if (space(u.at).water || u.carriedBy !== null) continue;
    if (u.type === 'factory') continue;
    const owner = s.owner[u.at];
    if (owner && !areAllied(owner, u.owner)) v.push(`${u.owner} ${u.type} sits in enemy-held ${u.at}`);
    const sides = byLand.get(u.at) ?? new Set();
    sides.add(areAllied(u.owner, 'Germans') ? 'Axis' : 'Allies');
    byLand.set(u.at, sides);
    if (u.type === 'battleship' && u.damage > 0) v.push(`battleship#${u.id} still damaged`);
  }
  for (const [at, sides] of byLand) if (sides.size > 1) v.push(`enemies share ${at}`);
  for (const u of s.units) {
    if (u.type === 'battleship' && u.damage > 0) v.push(`battleship#${u.id} still damaged`);
    if (!isAir(u.type) || space(u.at).water) continue;
    if (!canLandAir({ ...s, ownerAtTurnStart: s.owner }, u.at, u.owner)) v.push(`${u.owner} ${u.type} grounded in hostile ${u.at}`);
  }
  for (const zone of new Set(s.units.filter((u) => u.type === 'fighter' && space(u.at).water).map((u) => u.at))) {
    const sides = new Map<string, { fighters: number; slots: number }>();
    for (const u of s.units.filter((x) => x.at === zone)) {
      const side = areAllied(u.owner, 'Germans') ? 'Axis' : 'Allies';
      const e = sides.get(side) ?? { fighters: 0, slots: 0 };
      if (u.type === 'fighter') e.fighters += 1;
      if (u.type === 'carrier') e.slots += CARRIER_CAPACITY;
      sides.set(side, e);
    }
    for (const [side, e] of sides) if (e.fighters > e.slots) v.push(`${side} fighters without carriers in ${zone}`);
  }
  return v;
}
