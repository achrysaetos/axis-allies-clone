import type { Power, UnitType } from '../engine/types';

export interface PowerStyle {
  color: string;
  ink: string;
  short: string;
}

export const POWER_STYLE: Record<Power, PowerStyle> = {
  Russians: { color: '#8b2323', ink: '#fff', short: 'USSR' },
  Germans: { color: '#5a5a5a', ink: '#fff', short: 'GER' },
  British: { color: '#c8a86b', ink: '#1d1608', short: 'UK' },
  Japanese: { color: '#e08a1e', ink: '#1d1205', short: 'JPN' },
  Americans: { color: '#4f7a28', ink: '#fff', short: 'USA' },
};

export const NEUTRAL_FILL = '#d9cba6';
export const SEA_FILL = '#2f5f86';

export interface UnitGlyph {
  letter: string;
  name: string;
}

export const UNIT_GLYPH: Record<UnitType, UnitGlyph> = {
  infantry: { letter: 'I', name: 'Infantry' },
  artillery: { letter: 'Ar', name: 'Artillery' },
  armour: { letter: 'T', name: 'Tank' },
  aaGun: { letter: 'AA', name: 'AA gun' },
  factory: { letter: 'IC', name: 'Industrial complex' },
  fighter: { letter: 'F', name: 'Fighter' },
  bomber: { letter: 'B', name: 'Bomber' },
  transport: { letter: 'Tr', name: 'Transport' },
  submarine: { letter: 'S', name: 'Submarine' },
  destroyer: { letter: 'D', name: 'Destroyer' },
  cruiser: { letter: 'C', name: 'Cruiser' },
  carrier: { letter: 'CV', name: 'Carrier' },
  battleship: { letter: 'BB', name: 'Battleship' },
};

export const PHASE_LABEL = {
  purchase: 'Purchase',
  combatMove: 'Combat move',
  combat: 'Combat',
  noncombatMove: 'Noncombat move',
  mobilize: 'Mobilize',
} as const;
