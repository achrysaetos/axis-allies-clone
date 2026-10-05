import { actingPower } from '../engine/game';
import { capitalHeld } from '../engine/queries';
import type { GameState, Phase } from '../engine/types';
import { powerName } from './theme';

/** Who must act now, as this screen sees it. */
export type Actor = { kind: 'me' } | { kind: 'other'; who: string } | { kind: 'empty' };

type Phrasing = { phase: Partial<Record<Phase, string>>; holding: string; fight: string };

/** A finger has no shift key, right button or Esc, so touch screens get the gestures they can make. */
const PHRASES: Record<'mouse' | 'touch', Phrasing> = {
  mouse: {
    phase: {
      purchase:
        'Click units in the chart below to buy them; shift-click buys as many as you can afford. They arrive at Mobilize.',
      combatMove:
        'Drag pieces into enemy spaces to attack; shift-drag brings everything in the space. Click a piece to pick up one at a time.',
      noncombatMove: 'Move units that did not attack, and land every plane on friendly ground or a carrier.',
      mobilize: 'Drag new units from the tray onto a highlighted space. Anything left unplaced is refunded.',
    },
    holding: 'Drop on a highlighted space. Click a piece for one more, right-click to put one back, Esc to let go.',
    fight: 'Click a ⚔ to fight that battle.',
  },
  touch: {
    phase: {
      purchase: 'Tap units in the chart below to buy them. They arrive at Mobilize.',
      combatMove:
        'Drag pieces into enemy spaces to attack. Tap a piece to pick up one at a time, or double-tap to take them all.',
      noncombatMove: 'Move units that did not attack, and land every plane on friendly ground or a carrier.',
      mobilize:
        'Tap a unit in the tray (double-tap for all of them), then tap a highlighted space. Anything left unplaced is refunded.',
    },
    holding: 'Tap a highlighted space to move there, or the space they came from to put them back. Tap a piece for one more.',
    fight: 'Tap a ⚔ to fight that battle.',
  },
};

/** The one line at the top of the board that tells this player what to do next, or nothing when the board says it. */
export function hintFor(state: GameState, actor: Actor, holding: boolean, touch: boolean): string | undefined {
  const p = PHRASES[touch ? 'touch' : 'mouse'];
  if (state.winner) return `The ${state.winner} won. Open the ☰ menu for a new game.`;
  if (actor.kind === 'empty')
    return `Nobody holds ${powerName(actingPower(state))} yet. Click its seat above to play it or hand it to the computer, or invite a friend.`;
  if (actor.kind === 'other') return `${actor.who} is playing…`;
  if (holding) return p.holding;
  if (state.phase === 'combat')
    return state.battles.some((b) => !b.resolved) ? p.fight : 'Every battle is fought. End the phase.';
  if (state.phase === 'purchase' && !capitalHeld(state, state.power)) return undefined;
  return p.phase[state.phase];
}
