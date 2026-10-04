import { space } from '../engine/data';
import { doomedAir } from '../engine/game';
import { capitalHeld } from '../engine/queries';
import type { GameState } from '../engine/types';
import { UNIT_GLYPH } from './theme';

const plural = (n: number, word: string) => `${n} ${word.toLowerCase()}${n === 1 ? '' : 's'}`;

/** Consequences of ending the current phase that a player may not have meant. */
export function endPhaseWarnings(state: GameState): string[] {
  const out: string[] = [];
  const treasury = state.treasury[state.power];
  if (state.phase === 'purchase' && state.purchases.length === 0 && treasury >= 3 && capitalHeld(state, state.power))
    out.push(`You have not bought anything. Your ${treasury} IPCs will carry over to next turn.`);
  if (state.phase === 'noncombatMove' || state.phase === 'mobilize') {
    const doomed = doomedAir(state).map((id) => state.units.find((u) => u.id === id)!);
    if (doomed.length > 0) {
      const fighters = doomed.filter((u) => u.type === 'fighter').length;
      const bombers = doomed.length - fighters;
      const what = [fighters && plural(fighters, UNIT_GLYPH.fighter.name), bombers && plural(bombers, UNIT_GLYPH.bomber.name)].filter(Boolean).join(' and ');
      const where = [...new Set(doomed.map((u) => u.at))].join(', ');
      const rescue =
        state.phase === 'noncombatMove' && state.purchases.some((p) => p.type === 'carrier') && doomed.some((u) => space(u.at).water)
          ? ' A carrier you bought can still be placed under fighters at sea.'
          : '';
      out.push(`${what} in ${where} ${doomed.length === 1 ? 'has' : 'have'} nowhere to land and will be lost.${rescue}`);
    }
  }
  if (state.phase === 'mobilize') {
    const left = state.purchases.reduce((n, p) => n + p.count, 0);
    if (left > 0) out.push(`${plural(left, 'unit')} you bought ${left === 1 ? 'is' : 'are'} not placed. Their cost will be refunded.`);
  }
  return out;
}
