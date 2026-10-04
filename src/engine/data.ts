import mapJson from '../data/map.json';
import setupJson from '../data/setup.json';
import type { Power, Side, SpaceId, UnitType } from './types';

export interface UnitStats {
  cost: number;
  attack: number;
  defense: number;
  move: number;
  domain: 'land' | 'air' | 'sea' | 'static';
  hitPoints: number;
  transportCost?: number;
}

export const STATS: Record<UnitType, UnitStats> = {
  infantry: { cost: 3, attack: 1, defense: 2, move: 1, domain: 'land', hitPoints: 1, transportCost: 2 },
  artillery: { cost: 4, attack: 2, defense: 2, move: 1, domain: 'land', hitPoints: 1, transportCost: 3 },
  armour: { cost: 6, attack: 3, defense: 3, move: 2, domain: 'land', hitPoints: 1, transportCost: 3 },
  aaGun: { cost: 5, attack: 0, defense: 0, move: 1, domain: 'land', hitPoints: 1, transportCost: 3 },
  factory: { cost: 15, attack: 0, defense: 0, move: 0, domain: 'static', hitPoints: 1 },
  fighter: { cost: 10, attack: 3, defense: 4, move: 4, domain: 'air', hitPoints: 1 },
  bomber: { cost: 12, attack: 4, defense: 1, move: 6, domain: 'air', hitPoints: 1 },
  transport: { cost: 7, attack: 0, defense: 0, move: 2, domain: 'sea', hitPoints: 1 },
  submarine: { cost: 6, attack: 2, defense: 1, move: 2, domain: 'sea', hitPoints: 1 },
  destroyer: { cost: 8, attack: 2, defense: 2, move: 2, domain: 'sea', hitPoints: 1 },
  cruiser: { cost: 12, attack: 3, defense: 3, move: 2, domain: 'sea', hitPoints: 1 },
  carrier: { cost: 14, attack: 1, defense: 2, move: 2, domain: 'sea', hitPoints: 1 },
  battleship: { cost: 20, attack: 4, defense: 4, move: 2, domain: 'sea', hitPoints: 2 },
};

export const UNIT_NAME: Record<UnitType, string> = {
  infantry: 'infantry',
  artillery: 'artillery',
  armour: 'tank',
  aaGun: 'antiaircraft gun',
  factory: 'industrial complex',
  fighter: 'fighter',
  bomber: 'bomber',
  transport: 'transport',
  submarine: 'submarine',
  destroyer: 'destroyer',
  cruiser: 'cruiser',
  carrier: 'carrier',
  battleship: 'battleship',
};

export const unitCount = (n: number, t: UnitType) =>
  `${n} ${UNIT_NAME[t]}${n === 1 || t === 'infantry' || t === 'artillery' ? '' : 's'}`;

export const TRANSPORT_CAPACITY = 5;
export const CARRIER_CAPACITY = 2;
export const SURFACE_WARSHIPS: ReadonlySet<UnitType> = new Set(['battleship', 'carrier', 'cruiser', 'destroyer']);

export const isLand = (t: UnitType) => STATS[t].domain === 'land';
export const isAir = (t: UnitType) => STATS[t].domain === 'air';
export const isSea = (t: UnitType) => STATS[t].domain === 'sea';

export const SIDE: Record<Power, Side> = {
  Russians: 'Allies',
  Germans: 'Axis',
  British: 'Allies',
  Japanese: 'Axis',
  Americans: 'Allies',
};

export interface SpaceDef {
  id: SpaceId;
  water: boolean;
  ipc: number;
  originalOwner: Power | null;
  capital: Power | null;
  victoryCity: boolean;
  neighbors: SpaceId[];
}

export const SPACES: ReadonlyMap<SpaceId, SpaceDef> = new Map((mapJson.spaces as SpaceDef[]).map((s) => [s.id, s]));
export const SPACE_IDS: readonly SpaceId[] = [...SPACES.keys()];

export function space(id: SpaceId): SpaceDef {
  const s = SPACES.get(id);
  if (!s) throw new Error(`unknown space ${id}`);
  return s;
}

export const isNeutral = (id: SpaceId) => {
  const s = space(id);
  return !s.water && s.originalOwner === null;
};

export interface CanalDef {
  name: string;
  seaZones: SpaceId[];
  landTerritories: SpaceId[];
}
export const CANALS: readonly CanalDef[] = mapJson.canals;

export const CAPITAL_OF = Object.fromEntries(
  [...SPACES.values()].filter((s) => s.capital).map((s) => [s.capital, s.id]),
) as Record<Power, SpaceId>;

export const TURKISH_STRAITS_ZONE = '16 Sea Zone';

export interface SetupData {
  treasury: Record<Power, number>;
  units: { type: UnitType; at: SpaceId; owner: Power; count: number }[];
}
export const SETUP = setupJson as SetupData;

export const VICTORY_CITIES: readonly SpaceId[] = SPACE_IDS.filter((id) => space(id).victoryCity);
export const VICTORY_THRESHOLD: Record<'standard' | 'total', Record<Side, number>> = {
  standard: { Axis: 9, Allies: 10 },
  total: { Axis: 13, Allies: 13 },
};
