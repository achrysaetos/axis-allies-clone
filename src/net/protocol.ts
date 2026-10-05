import type { Action, GameState, Options, Power, Unit } from '../engine/types';

export type PlayerId = string;

/** The server plays a seat the players handed to it. Player ids are UUIDs, so this never clashes with one. */
export const COMPUTER = 'computer';
/** Who holds a power: a player, the computer, or nobody yet. */
export type Holder = PlayerId | typeof COMPUTER | null;

export interface PublicPlayer {
  id: PlayerId;
  name: string;
  online: boolean;
}

export interface RoomView {
  id: string;
  /** Bumps on every accepted change to the game. */
  version: number;
  seats: Record<Power, Holder>;
  players: PublicPlayer[];
  /** rng = 0 and scriptedDice = [] so the dice stay secret. */
  state: GameState;
  fallen: Unit[];
  canUndo: boolean;
}

/** A browser's Web Push subscription, as `PushSubscription.toJSON()` gives it, with base64url keys. */
export interface PushSubscriptionKeys {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export type ClientMsg =
  | { t: 'hello'; token: string | null }
  | { t: 'join'; name: string }
  | { t: 'seat'; power: Power; to: 'me' | 'computer' | 'open' }
  | { t: 'act'; version: number; actions: Action[] }
  | { t: 'resolve'; version: number; battle: number }
  | { t: 'undo'; version: number }
  | { t: 'subscribe'; subscription: PushSubscriptionKeys };

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

export interface PushKeyResponse {
  /** The VAPID public key, or null when this server sends no pushes. */
  key: string | null;
}

/** What the service worker receives; `url` is relative to the app's origin. */
export interface PushPayload {
  title: string;
  body: string;
  url: string;
}

export const ROOM_ID = /^[a-z2-7]{10}$/;
export const NAME_MAX = 24;
/** Close code for a socket opened on a room that was never created; the client stops reconnecting. */
export const NO_SUCH_ROOM = 4404;
