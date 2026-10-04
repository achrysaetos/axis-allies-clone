import { POWERS } from '../engine/types';
import type { Power, UnitType } from '../engine/types';

export interface PowerStyle {
  name: string;
  color: string;
  /** Readable on the dark panels, for headings in the power's color. */
  text: string;
  ink: string;
  short: string;
}

export const POWER_STYLE: Record<Power, PowerStyle> = {
  Russians: { name: 'Soviet Union', color: '#8b2323', text: '#e2706a', ink: '#fff', short: 'USSR' },
  Germans: { name: 'Germany', color: '#5a5a5a', text: '#c4c4c4', ink: '#fff', short: 'GER' },
  British: { name: 'United Kingdom', color: '#c8a86b', text: '#dcc18e', ink: '#1d1608', short: 'UK' },
  Japanese: { name: 'Japan', color: '#e08a1e', text: '#f0a443', ink: '#1d1205', short: 'JPN' },
  Americans: { name: 'United States', color: '#4f7a28', text: '#93c461', ink: '#fff', short: 'USA' },
};

export const powerName = (p: Power) => POWER_STYLE[p].name;

const POWER_WORD = new RegExp(`\\b(${POWERS.join('|')})\\b`, 'g');

/** Engine log lines name powers by id; show the rulebook's nation names instead. */
export const readable = (line: string) => line.replace(POWER_WORD, (p) => POWER_STYLE[p as Power].name);

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

export const PHASE_GUIDE = {
  purchase: 'Buy units with your IPCs. They arrive at your industrial complexes in the Mobilize phase.',
  combatMove: 'Move units into enemy territory or sea zones to attack. Every planned attack needs a way home for its planes.',
  combat: 'Fight each battle. Bombing raids go first, then landings from the sea, then everything else.',
  noncombatMove: 'Move units that did not attack, and land every plane in a friendly territory or on a carrier.',
  mobilize: 'Place the units you bought at your industrial complexes. Ships go in a sea zone next to one.',
} as const;

export const PHASE_LABEL = {
  purchase: 'Purchase',
  combatMove: 'Combat move',
  combat: 'Combat',
  noncombatMove: 'Noncombat move',
  mobilize: 'Mobilize',
} as const;
