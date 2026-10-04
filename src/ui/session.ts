import { autoCasualties } from '../engine/casualties';
import { battleBlocker } from '../engine/combat';
import { apply } from '../engine/game';
import { POWERS } from '../engine/types';
import type { Action, Battle, Decision, GameState, Power, Unit } from '../engine/types';

export type Controller = 'human' | 'ai';

export interface Session {
  state: GameState;
  controllers: Record<Power, Controller>;
  /** States before each move of the current movement phase. */
  undo: GameState[];
  /** Units that left play, so finished battles can still show what died. */
  fallen: Unit[];
}

const FALLEN_LIMIT = 400;
const SAVE_KEY = 'aa1942.session.v1';

export function newSession(state: GameState, controllers: Record<Power, Controller>): Session {
  return { state, controllers, undo: [], fallen: [] };
}

export type Step = { ok: true; session: Session } | { ok: false; error: string };

export function act(session: Session, action: Action): Step {
  const r = apply(session.state, action);
  if (!r.ok) return r;
  const alive = new Set(r.state.units.map((u) => u.id));
  const died = session.state.units.filter((u) => !alive.has(u.id));
  return {
    ok: true,
    session: {
      ...session,
      state: r.state,
      undo: action.type === 'move' ? [...session.undo, session.state] : [],
      fallen: died.length > 0 ? [...session.fallen, ...died].slice(-FALLEN_LIMIT) : session.fallen,
    },
  };
}

export function undo(session: Session): Session {
  const prev = session.undo[session.undo.length - 1];
  if (!prev) return session;
  return { ...session, state: prev, undo: session.undo.slice(0, -1) };
}

export function casualtyPool(state: GameState, b: Battle, side: 'attacker' | 'defender'): Unit[] {
  const ids = side === 'attacker' ? b.attackers : b.defenders;
  return state.units.filter((u) => ids.includes(u.id) && !b.submerged.includes(u.id) && !b.doomed.includes(u.id));
}

/** The engine's simplest legal answer to a pending decision. */
export function defaultDecision(state: GameState, d: Decision): Action {
  switch (d.kind) {
    case 'casualties': {
      const b = state.battles.find((x) => x.id === d.battle);
      return { type: 'casualties', units: b ? autoCasualties(d.groups, casualtyPool(state, b, d.side)) : [] };
    }
    case 'submerge':
      return { type: 'submerge', units: [] };
    case 'retreat':
      return { type: 'retreat', to: null };
    case 'bombard':
      return { type: 'bombard', ships: d.ships.slice(0, d.max) };
    case 'landStranded':
      return { type: 'landStranded', landings: Object.fromEntries(d.fighters.map((f) => [f, d.options[f]?.[0] ?? null])) };
  }
}

/** Keeps an AI turn moving when its own action is rejected. */
export function fallbackAction(state: GameState): Action {
  if (state.pending) return defaultDecision(state, state.pending);
  if (state.phase === 'combat') {
    const open = state.battles.find((b) => !b.resolved && battleBlocker(state, b) === null);
    if (open) return { type: 'startBattle', battle: open.id };
  }
  return { type: 'endPhase' };
}

interface SavedSession {
  version: 1;
  state: GameState;
  controllers: Record<Power, Controller>;
}

export function serialize(session: Session): string {
  const saved: SavedSession = { version: 1, state: session.state, controllers: session.controllers };
  return JSON.stringify(saved);
}

export function parseSession(text: string): Session | string {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return 'not a JSON file';
  }
  if (typeof raw !== 'object' || raw === null) return 'not a saved game';
  const r = raw as Partial<SavedSession>;
  const s = r.state;
  if (r.version !== 1 || !s || !Array.isArray(s.units) || typeof s.round !== 'number' || !POWERS.includes(s.power))
    return 'not a saved game from this version';
  const controllers = Object.fromEntries(
    POWERS.map((p) => [p, r.controllers?.[p] === 'ai' ? 'ai' : 'human']),
  ) as Record<Power, Controller>;
  return newSession(s, controllers);
}

export function loadAutosave(): Session | null {
  try {
    const text = localStorage.getItem(SAVE_KEY);
    if (!text) return null;
    const s = parseSession(text);
    return typeof s === 'string' ? null : s;
  } catch {
    return null;
  }
}

export function autosave(session: Session): void {
  try {
    localStorage.setItem(SAVE_KEY, serialize(session));
  } catch {
    // Storage can be full or blocked; the game keeps running and export still works.
  }
}

export function downloadSave(session: Session): void {
  const blob = new Blob([serialize(session)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `aa1942-round${session.state.round}-${session.state.power}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
