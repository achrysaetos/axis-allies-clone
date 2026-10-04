import type { Action, GameState } from '../engine/types';

export function randomAction(_state: GameState): Action {
  return { type: 'endPhase' };
}
