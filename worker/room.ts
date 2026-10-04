import { actingPower } from '../src/engine/game';
import { newGame } from '../src/engine/state';
import { POWERS } from '../src/engine/types';
import type { Action, GameState, Options, Power, Unit } from '../src/engine/types';
import { NAME_MAX } from '../src/net/protocol';
import type { ClientMsg, PlayerId, RoomView, ServerMsg } from '../src/net/protocol';
import { act, quickResolve } from '../src/ui/session';
import type { Controller, Session } from '../src/ui/session';

export interface RoomRecord {
  id: string;
  version: number;
  seats: Record<Power, PlayerId | null>;
  players: { id: PlayerId; name: string; token: string }[];
  session: { state: GameState; fallen: Unit[] };
  /** The state before the first move of the current phase; undo replays `moves` from here. */
  phaseStart: GameState | null;
  moves: Action[];
}

export interface Outcome {
  record: RoomRecord;
  error?: string;
  reply?: ServerMsg;
}

export function newRoom(id: string, seed: number, options: Partial<Options>): RoomRecord {
  return {
    id,
    version: 0,
    seats: Object.fromEntries(POWERS.map((p) => [p, null])) as Record<Power, PlayerId | null>,
    players: [],
    session: { state: newGame(seed, options), fallen: [] },
    phaseStart: null,
    moves: [],
  };
}

export function view(r: RoomRecord, online: ReadonlySet<PlayerId>): RoomView {
  return {
    id: r.id,
    version: r.version,
    seats: r.seats,
    players: r.players.map((p) => ({ id: p.id, name: p.name, online: online.has(p.id) })),
    state: { ...r.session.state, rng: 0, scriptedDice: [] },
    fallen: r.session.fallen,
    canUndo: r.moves.length > 0,
  };
}

const HUMANS = Object.fromEntries(POWERS.map((p) => [p, 'human'])) as Record<Power, Controller>;
const asSession = (r: RoomRecord, state = r.session.state): Session => ({ ...r.session, state, controllers: HUMANS, undo: [] });

function played(r: RoomRecord, s: Session, action: Action | null): RoomRecord {
  const move = action?.type === 'move';
  return {
    ...r,
    version: r.version + 1,
    session: { state: s.state, fallen: s.fallen },
    phaseStart: move ? (r.phaseStart ?? r.session.state) : null,
    moves: move ? [...r.moves, action] : [],
  };
}

export function handle(r: RoomRecord, me: PlayerId | null, msg: ClientMsg, online: ReadonlySet<PlayerId>): Outcome {
  const refuse = (error: string): Outcome => ({ record: r, error });
  switch (msg.t) {
    case 'hello': {
      const p = msg.token ? r.players.find((x) => x.token === msg.token) : undefined;
      return { record: r, reply: { t: 'welcome', player: p?.id ?? null, token: p?.token ?? null } };
    }
    case 'join': {
      if (me) return refuse('you have already joined');
      const name = msg.name.trim().slice(0, NAME_MAX);
      if (!name) return refuse('pick a name first');
      const p = { id: crypto.randomUUID(), name, token: crypto.randomUUID() };
      return { record: { ...r, players: [...r.players, p] }, reply: { t: 'welcome', player: p.id, token: p.token } };
    }
    case 'seat': {
      if (!me) return refuse('pick a name first');
      const holder = r.seats[msg.power];
      if (!msg.take) {
        if (holder !== me) return refuse('that seat is not yours');
        return { record: { ...r, seats: { ...r.seats, [msg.power]: null } } };
      }
      if (holder === me) return { record: r };
      if (holder && online.has(holder)) return refuse('another player holds that seat');
      return { record: { ...r, seats: { ...r.seats, [msg.power]: me } } };
    }
    case 'act':
    case 'resolve': {
      const { state } = r.session;
      if (state.winner) return refuse('the game is over');
      if (!me || r.seats[actingPower(state)] !== me) return refuse('it is not your move');
      if (msg.version !== r.version) return refuse('the game moved on before your action arrived');
      const step =
        msg.t === 'act' ? act(asSession(r), msg.action) : quickResolve(asSession(r), msg.battle, (p) => r.seats[p] === me);
      if (!step.ok) return refuse(step.error);
      return { record: played(r, step.session, msg.t === 'act' ? msg.action : null) };
    }
    case 'undo': {
      if (!me || r.seats[r.session.state.power] !== me) return refuse('it is not your turn');
      if (msg.version !== r.version) return refuse('the game moved on before your undo arrived');
      if (!r.phaseStart || r.moves.length === 0) return refuse('nothing to undo');
      let s = asSession(r, r.phaseStart);
      for (const m of r.moves.slice(0, -1)) {
        const step = act(s, m);
        if (!step.ok) return refuse(`undo could not replay a move: ${step.error}`);
        s = step.session;
      }
      const moves = r.moves.slice(0, -1);
      return {
        record: {
          ...r,
          version: r.version + 1,
          session: { state: s.state, fallen: s.fallen },
          phaseStart: moves.length > 0 ? r.phaseStart : null,
          moves,
        },
      };
    }
  }
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isVersion = (x: unknown): x is number => Number.isInteger(x);

/** Checks the envelope; the engine itself rejects a well-formed action that breaks a rule. */
export function parseClientMsg(text: string): ClientMsg | null {
  let m: unknown;
  try {
    m = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(m)) return null;
  switch (m.t) {
    case 'hello':
      return m.token === null || typeof m.token === 'string' ? { t: 'hello', token: m.token } : null;
    case 'join':
      return typeof m.name === 'string' ? { t: 'join', name: m.name } : null;
    case 'seat':
      return POWERS.includes(m.power as Power) && typeof m.take === 'boolean'
        ? { t: 'seat', power: m.power as Power, take: m.take }
        : null;
    case 'act':
      return isVersion(m.version) && isObject(m.action) && typeof m.action.type === 'string'
        ? { t: 'act', version: m.version, action: m.action as Action }
        : null;
    case 'resolve':
      return isVersion(m.version) && Number.isInteger(m.battle)
        ? { t: 'resolve', version: m.version, battle: m.battle as number }
        : null;
    case 'undo':
      return isVersion(m.version) ? { t: 'undo', version: m.version } : null;
    default:
      return null;
  }
}

export function parseOptions(x: unknown): Partial<Options> {
  const o = isObject(x) ? x : {};
  return {
    victory: o.victory === 'total' ? 'total' : 'standard',
    turkishStraitsClosed: o.turkishStraitsClosed === true,
    sbrEscortsInterceptors: o.sbrEscortsInterceptors === true,
  };
}
