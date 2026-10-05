import { actingPower } from '../src/engine/game';
import { newGame } from '../src/engine/state';
import { POWERS } from '../src/engine/types';
import type { Action, Decision, GameState, Options, Power, Unit } from '../src/engine/types';
import { COMPUTER, NAME_MAX } from '../src/net/protocol';
import type { ClientMsg, Holder, PlayerId, PushSubscriptionKeys, RoomView, ServerMsg } from '../src/net/protocol';
import { powerName } from '../src/ui/theme';
import { actAll, aiBurst, quickResolve } from '../src/ui/session';
import type { Controller, Session } from '../src/ui/session';

export interface RoomRecord {
  id: string;
  version: number;
  seats: Record<Power, Holder>;
  /** `leftAt` is when the player's last connection closed; their seats stay theirs for a grace period after it. */
  players: { id: PlayerId; name: string; token: string; leftAt?: number }[];
  session: { state: GameState; fallen: Unit[] };
  /** The state before the first move of the current phase; undo replays `moves` from here, one drop at a time. */
  phaseStart: GameState | null;
  moves: Action[][];
  /** Unique by endpoint. */
  pushes: ({ player: PlayerId } & PushSubscriptionKeys)[];
}

export interface Outcome {
  record: RoomRecord;
  error?: string;
  reply?: ServerMsg;
}

export function newRoom(id: string, seed: number, options: Partial<Options>, computer: readonly Power[] = []): RoomRecord {
  return {
    id,
    version: 0,
    seats: Object.fromEntries(POWERS.map((p) => [p, computer.includes(p) ? COMPUTER : null])) as Record<Power, Holder>,
    players: [],
    session: { state: newGame(seed, options), fallen: [] },
    phaseStart: null,
    moves: [],
    pushes: [],
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

const controllersOf = (r: RoomRecord) =>
  Object.fromEntries(POWERS.map((p) => [p, r.seats[p] === COMPUTER ? 'ai' : 'human'])) as Record<Power, Controller>;
/**
 * A 32-bit dice state could be recovered from a dozen public rolls, so every step that may roll starts from fresh
 * server randomness, and past dice say nothing about future ones.
 */
const reseeded = (r: RoomRecord): GameState => ({
  ...r.session.state,
  rng: crypto.getRandomValues(new Uint32Array(1))[0]! || 1,
});
const asSession = (r: RoomRecord, state = r.session.state): Session => ({
  ...r.session,
  state,
  controllers: controllersOf(r),
  undo: [],
});

function played(r: RoomRecord, s: Session, actions: Action[]): RoomRecord {
  const move = actions.length > 0 && actions.every((a) => a.type === 'move');
  return {
    ...r,
    version: r.version + 1,
    session: { state: s.state, fallen: s.fallen },
    phaseStart: move ? (r.phaseStart ?? r.session.state) : null,
    moves: move ? [...r.moves, actions] : [],
  };
}

export const MAX_PLAYERS = 24;
/** A drop of many moves is one message; anything else is a single action, so one message never acts past the sender's move. */
export const MAX_BATCH = 40;
/** A phone that locks drops its connection for a moment; nobody may take that player's seats until this has passed. */
export const SEAT_GRACE_MS = 90_000;

export function handle(
  r: RoomRecord,
  me: PlayerId | null,
  msg: ClientMsg,
  online: ReadonlySet<PlayerId>,
  now = Date.now(),
): Outcome {
  const refuse = (error: string): Outcome => ({ record: r, error });
  switch (msg.t) {
    case 'hello': {
      const p = msg.token ? r.players.find((x) => x.token === msg.token) : undefined;
      return { record: r, reply: { t: 'welcome', player: p?.id ?? null, token: p?.token ?? null } };
    }
    case 'join': {
      if (me) return refuse('you have already joined');
      if (r.players.length >= MAX_PLAYERS) return refuse('this game already has as many players as it can take');
      const name = msg.name.trim().slice(0, NAME_MAX);
      if (!name) return refuse('pick a name first');
      const p = { id: crypto.randomUUID(), name, token: crypto.randomUUID() };
      return { record: { ...r, players: [...r.players, p] }, reply: { t: 'welcome', player: p.id, token: p.token } };
    }
    case 'seat': {
      if (!me) return refuse('pick a name first');
      const holder = r.seats[msg.power];
      if (msg.to === 'open' && holder !== me && holder !== COMPUTER) return refuse('that seat is not yours');
      if (msg.to !== 'open' && holder !== null && holder !== COMPUTER && holder !== me) {
        if (online.has(holder)) return refuse('another player holds that seat');
        const left = r.players.find((p) => p.id === holder)?.leftAt;
        if (left !== undefined && now - left < SEAT_GRACE_MS)
          return refuse('that player lost their connection a moment ago; give them a minute to come back');
      }
      const next = msg.to === 'me' ? me : msg.to === 'computer' ? COMPUTER : null;
      if (holder === next) return { record: r };
      return { record: { ...r, seats: { ...r.seats, [msg.power]: next } } };
    }
    case 'act':
    case 'resolve': {
      const { state } = r.session;
      if (state.winner) return refuse('the game is over');
      if (!me || r.seats[actingPower(state)] !== me) return refuse('it is not your move');
      if (msg.version !== r.version) return refuse('the game moved on before your action arrived');
      if (msg.t === 'act' && msg.actions.length > 1 && !msg.actions.every((a) => a.type === 'move'))
        return refuse('only moves can be sent together');
      // Moves never roll, and undo replays them, so only a step that can roll draws fresh dice.
      const rolls = msg.t === 'resolve' || !msg.actions.every((a) => a.type === 'move');
      const session = asSession(r, rolls ? reseeded(r) : r.session.state);
      const step = msg.t === 'act' ? actAll(session, msg.actions) : quickResolve(session, msg.battle, (p) => r.seats[p] === me);
      if (!step.ok) return refuse(step.error);
      return { record: played(r, step.session, msg.t === 'act' ? msg.actions : []) };
    }
    case 'undo': {
      if (!me || r.seats[r.session.state.power] !== me) return refuse('it is not your turn');
      if (msg.version !== r.version) return refuse('the game moved on before your undo arrived');
      if (!r.phaseStart || r.moves.length === 0) return refuse('nothing to undo');
      let s = asSession(r, r.phaseStart);
      for (const m of r.moves.slice(0, -1)) {
        const step = actAll(s, m);
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
    case 'subscribe': {
      if (!me) return refuse('pick a name first');
      const sub = { player: me, ...msg.subscription };
      const same = r.pushes.find((x) => x.endpoint === sub.endpoint);
      if (same && JSON.stringify(same) === JSON.stringify(sub)) return { record: r };
      const kept = [...r.pushes.filter((x) => x.endpoint !== sub.endpoint), sub];
      const dropped = new Set(kept.filter((x) => x.player === me).slice(0, -PUSHES_PER_PLAYER));
      return { record: { ...r, pushes: kept.filter((x) => !dropped.has(x)) } };
    }
  }
}

/** Browsers a player can be reached on; the oldest drops off past this. */
export const PUSHES_PER_PLAYER = 5;

export const computerToMove = (r: RoomRecord) => !r.session.state.winner && r.seats[actingPower(r.session.state)] === COMPUTER;

/** The computer's next stretch of play when one of its seats must act, or null when no computer is to move. */
export function computerTurn(r: RoomRecord, maxSteps: number): Outcome | null {
  if (!computerToMove(r)) return null;
  // Worker clocks stand still during computation, so the burst is bounded by actions rather than time.
  // The computer's last resort is replaying its movement phase from the start, so that start outlives each burst.
  const before = r.session.state;
  const phaseStart = r.phaseStart ?? before;
  // Only battles roll; other phases keep the state as is, so the computer's cached plan still matches it.
  const state = before.phase === 'combat' ? reseeded(r) : before;
  const step = aiBurst({ ...asSession(r, state), undo: [phaseStart] }, Infinity, maxSteps);
  if (!step.ok) return { record: r, error: step.error };
  const { state: next, fallen } = step.session;
  const moving = (next.phase === 'combatMove' || next.phase === 'noncombatMove') && !next.pending;
  const samePhase = moving && next.phase === before.phase && next.power === before.power;
  return {
    record: {
      ...r,
      version: r.version + 1,
      session: { state: next, fallen },
      phaseStart: samePhase ? phaseStart : null,
      moves: [],
    },
  };
}

export interface Notice {
  player: PlayerId;
  title: string;
  body: string;
}

const ADJECTIVE: Record<Power, string> = {
  Russians: 'Soviet',
  Germans: 'German',
  British: 'British',
  Japanese: 'Japanese',
  Americans: 'American',
};

const DECISION: { [K in Decision['kind']]: (power: string, space: string) => string } = {
  casualties: (p, at) => `${p} must choose casualties in ${at}`,
  submerge: (p, at) => `${p} may submerge submarines in ${at}`,
  retreat: (p, at) => `${p} may retreat from ${at}`,
  bombard: (p, at) => `${p} may bombard ${at}`,
  intercept: (p, at) => `${p} may intercept the raid on ${at}`,
  landStranded: (p) => `${p} must land stranded fighters`,
};

/** Marks a player's last connection closing, which starts the grace period on their seats. */
export function left(r: RoomRecord, player: PlayerId, now: number): RoomRecord {
  return { ...r, players: r.players.map((p) => (p.id === player ? { ...p, leftAt: now } : p)) };
}

/** Offline players who should hear that a change made it their move, or that the game is over. */
export function whoToNotify(before: RoomRecord, after: RoomRecord, online: ReadonlySet<PlayerId>): Notice[] {
  const was = before.session.state;
  const now = after.session.state;
  const name = (id: Holder) => (id === COMPUTER ? 'The computer' : (after.players.find((p) => p.id === id)?.name ?? 'Someone'));
  const actor = name(before.seats[actingPower(was)]);
  if (now.winner) {
    if (was.winner) return [];
    return after.players
      .filter((p) => !online.has(p.id))
      .map((p) => ({ player: p.id, title: `The ${now.winner} win`, body: `Round ${now.round} · ${actor} finished the game` }));
  }
  const acting = actingPower(now);
  const player = after.seats[acting];
  if (!player || player === COMPUTER || player === before.seats[actingPower(was)] || online.has(player)) return [];
  const d = now.pending;
  const space = d && 'battle' in d ? (now.battles.find((b) => b.id === d.battle)?.space ?? '') : '';
  const body = d
    ? DECISION[d.kind](powerName(acting), space)
    : now.power !== was.power
      ? `Round ${now.round} · ${actor} finished the ${ADJECTIVE[was.power]} turn`
      : `Round ${now.round} · ${actor} made the ${ADJECTIVE[actingPower(was)]} decision`;
  return [{ player, title: `Your move: ${powerName(acting)}`, body }];
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isVersion = (x: unknown): x is number => Number.isInteger(x);

const B64URL = /^[A-Za-z0-9_-]+$/;
/** The browsers' push services; the Worker posts to no other host, so a subscription cannot aim it elsewhere. */
const PUSH_HOSTS = ['fcm.googleapis.com', 'push.services.mozilla.com', 'push.apple.com', 'notify.windows.com'];
/** Lengths of a P-256 public key (65 bytes) and an auth secret (16 bytes) in unpadded base64url. */
const P256DH_LENGTH = 87;
const AUTH_LENGTH = 22;

function parseSubscription(x: unknown): PushSubscriptionKeys | null {
  if (!isObject(x) || typeof x.endpoint !== 'string' || x.endpoint.length > 2048 || !isObject(x.keys)) return null;
  const { p256dh, auth } = x.keys;
  if (typeof p256dh !== 'string' || p256dh.length !== P256DH_LENGTH || !B64URL.test(p256dh)) return null;
  if (typeof auth !== 'string' || auth.length !== AUTH_LENGTH || !B64URL.test(auth)) return null;
  if (!URL.canParse(x.endpoint)) return null;
  const url = new URL(x.endpoint);
  if (url.protocol !== 'https:' || !PUSH_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`))) return null;
  return { endpoint: x.endpoint, keys: { p256dh, auth } };
}

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
      return POWERS.includes(m.power as Power) && (m.to === 'me' || m.to === 'computer' || m.to === 'open')
        ? { t: 'seat', power: m.power as Power, to: m.to }
        : null;
    case 'act':
      return isVersion(m.version) &&
        Array.isArray(m.actions) &&
        m.actions.length > 0 &&
        m.actions.length <= MAX_BATCH &&
        m.actions.every((a) => isObject(a) && typeof a.type === 'string')
        ? { t: 'act', version: m.version, actions: m.actions as Action[] }
        : null;
    case 'resolve':
      return isVersion(m.version) && Number.isInteger(m.battle)
        ? { t: 'resolve', version: m.version, battle: m.battle as number }
        : null;
    case 'undo':
      return isVersion(m.version) ? { t: 'undo', version: m.version } : null;
    case 'subscribe': {
      const subscription = parseSubscription(m.subscription);
      return subscription && { t: 'subscribe', subscription };
    }
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
