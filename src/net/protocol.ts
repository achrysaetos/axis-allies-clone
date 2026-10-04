import type { Action, GameState, Options, Power, Unit } from '../engine/types';

export type PlayerId = string;

export interface PublicPlayer {
  id: PlayerId;
  name: string;
  online: boolean;
}

export interface RoomView {
  id: string;
  /** Bumps on every accepted change to the game. */
  version: number;
  seats: Record<Power, PlayerId | null>;
  players: PublicPlayer[];
  /** rng = 0 and scriptedDice = [] so the dice stay secret. */
  state: GameState;
  fallen: Unit[];
  canUndo: boolean;
}

export type ClientMsg =
  | { t: 'hello'; token: string | null }
  | { t: 'join'; name: string }
  | { t: 'seat'; power: Power; take: boolean }
  | { t: 'act'; version: number; action: Action }
  | { t: 'resolve'; version: number; battle: number }
  | { t: 'undo'; version: number };

export type ServerMsg =
  | { t: 'welcome'; player: PlayerId | null; token: string | null }
  | { t: 'room'; room: RoomView }
  | { t: 'error'; message: string };

export interface CreateRoomRequest {
  options: Partial<Options>;
}

export interface CreateRoomResponse {
  id: string;
}

export const ROOM_ID = /^[a-z2-7]{10}$/;
export const NAME_MAX = 24;
/** Close code for a socket opened on a room that was never created; the client stops reconnecting. */
export const NO_SUCH_ROOM = 4404;
