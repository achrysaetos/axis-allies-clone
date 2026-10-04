import type { Action, GameState } from '../engine/types';
import { randomAction } from './random';

/** The next action for whichever power must act in `state` (see actingPower). */
export function aiAction(state: GameState): Action {
  return randomAction(state);
}
