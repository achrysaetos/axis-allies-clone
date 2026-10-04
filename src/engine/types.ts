export const POWERS = ['Russians', 'Germans', 'British', 'Japanese', 'Americans'] as const;
export type Power = (typeof POWERS)[number];
export type Side = 'Axis' | 'Allies';

export const UNIT_TYPES = [
  'infantry',
  'artillery',
  'armour',
  'aaGun',
  'factory',
  'fighter',
  'bomber',
  'transport',
  'submarine',
  'destroyer',
  'cruiser',
  'carrier',
  'battleship',
] as const;
export type UnitType = (typeof UNIT_TYPES)[number];
export type PurchasableType = UnitType;

export type SpaceId = string;
export type UnitId = number;

export interface Unit {
  id: UnitId;
  type: UnitType;
  owner: Power;
  at: SpaceId;
  /** Hits absorbed this battle (battleship) or bombing damage (factory). */
  damage: number;
  /** Movement points spent this turn. */
  moved: number;
  /** Space the unit occupied when this turn began. */
  turnStart: SpaceId;
  /** Last space entered before the current one during combat move; retreat target candidate. */
  cameFrom: SpaceId | null;
  /** Transport or carrier this unit rides as cargo. */
  carriedBy: UnitId | null;
  /** Phase in which this cargo was loaded this turn. */
  loadedIn: 'combatMove' | 'noncombatMove' | null;
  /** Land unit has offloaded this turn, or transport has offloaded into this territory. */
  offloadedTo: SpaceId | null;
  movedInCombat: boolean;
  fought: boolean;
  bombarded: boolean;
  /** Bomber declared for a strategic bombing raid. */
  sbr: boolean;
  retreated: boolean;
  /** Tank passed through an empty hostile territory this combat move. */
  blitzed: boolean;
  /** Sea unit left a hostile sea zone it started in. */
  escaped: boolean;
}

export type Phase = 'purchase' | 'combatMove' | 'combat' | 'noncombatMove' | 'mobilize';

export interface Purchase {
  type: UnitType;
  count: number;
}

export type BattleKind = 'land' | 'sea' | 'sbr';

export type BattleStep =
  | 'start'
  | 'bombard'
  | 'aa'
  | 'roundStart'
  | 'submergeAttacker'
  | 'submergeDefender'
  | 'subStrike'
  | 'attackerFire'
  | 'defenderFire'
  | 'removeCasualties'
  | 'endRound'
  | 'retreat'
  | 'airBattle'
  | 'interceptorsFire'
  | 'raid'
  | 'done';

export interface PendingHits {
  /** Whose units take these hits. */
  side: 'attacker' | 'defender';
  groups: HitGroup[];
  /** Immediate casualties leave play now; otherwise they fire back first. */
  immediate: boolean;
  reason: 'aa' | 'bombard' | 'subStrike' | 'fire';
}

export interface Battle {
  id: number;
  space: SpaceId;
  kind: BattleKind;
  attacker: Power;
  /** Only enemy submarines and/or transports defend, so the attacker may decline. */
  optional: boolean;
  /** SBR first, then amphibious assaults, then general combat. */
  tier: 0 | 1 | 2;
  round: number;
  step: BattleStep;
  attackers: UnitId[];
  defenders: UnitId[];
  /** Land units that came ashore from transports and cannot retreat. */
  seaborne: UnitId[];
  /** Defenders hit this round that still fire back. */
  doomed: UnitId[];
  submerged: UnitId[];
  /** Submarines that fired a surprise strike this round. */
  struck: UnitId[];
  /** Adjacent spaces attacking land or sea units entered from. */
  origins: SpaceId[];
  queue: PendingHits[];
  dice: { side: 'attacker' | 'defender'; label: string; rolls: number[]; hits: number }[];
  resolved: boolean;
  skipped: boolean;
  winner: 'attacker' | 'defender' | 'none' | null;
}

export type HitCategory = 'any' | 'notAir' | 'notSub' | 'air';

export interface HitGroup {
  category: HitCategory;
  hits: number;
}

export type Decision =
  | {
      kind: 'casualties';
      battle: number;
      power: Power;
      side: 'attacker' | 'defender';
      groups: HitGroup[];
      /** When true the chosen units die immediately (attacker losses, sub strikes). */
      immediate: boolean;
      reason: PendingHits['reason'];
    }
  | { kind: 'submerge'; battle: number; power: Power; side: 'attacker' | 'defender'; subs: UnitId[] }
  | { kind: 'retreat'; battle: number; power: Power; options: SpaceId[] }
  | { kind: 'bombard'; battle: number; power: Power; ships: UnitId[]; max: number }
  | { kind: 'intercept'; battle: number; power: Power; fighters: UnitId[] }
  | { kind: 'landStranded'; power: Power; fighters: UnitId[]; options: Record<UnitId, SpaceId[]> };

export interface Options {
  victory: 'standard' | 'total';
  turkishStraitsClosed: boolean;
  /** Optional rule p.14: fighters escort raids and intercept them. */
  sbrEscortsInterceptors: boolean;
}

export interface GameState {
  options: Options;
  round: number;
  power: Power;
  phase: Phase;
  treasury: Record<Power, number>;
  owner: Record<SpaceId, Power>;
  /** Control at the start of the current power's turn. */
  ownerAtTurnStart: Record<SpaceId, Power>;
  /** Territories captured this turn (cannot land, cannot place factories). */
  capturedThisTurn: SpaceId[];
  units: Unit[];
  nextUnitId: number;
  purchases: Purchase[];
  /** Units mobilized through each industrial complex this turn. */
  placements: Record<SpaceId, number>;
  battles: Battle[];
  activeBattle: number | null;
  pending: Decision | null;
  rng: number;
  /** Dice consumed before the seeded generator; used for replays and tests. */
  scriptedDice: number[];
  winner: Side | null;
  log: string[];
}

export type Action =
  | { type: 'buy'; purchases: Purchase[] }
  | { type: 'repair'; factory: UnitId; amount: number }
  | { type: 'move'; units: UnitId[]; path: SpaceId[]; sbr?: boolean; transport?: UnitId }
  | { type: 'endPhase' }
  | { type: 'startBattle'; battle: number }
  | { type: 'skipBattle'; battle: number }
  | { type: 'casualties'; units: UnitId[] }
  | { type: 'submerge'; units: UnitId[] }
  | { type: 'retreat'; to: SpaceId | null }
  | { type: 'bombard'; ships: UnitId[] }
  | { type: 'intercept'; units: UnitId[] }
  | { type: 'landStranded'; landings: Record<UnitId, SpaceId | null> }
  | { type: 'place'; unitType: UnitType; at: SpaceId; count: number };

export type Result = { ok: true; state: GameState } | { ok: false; error: string };
