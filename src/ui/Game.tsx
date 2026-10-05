import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CAPITAL_OF, isAir, unitCount } from '../engine/data';
import { battleBlocker } from '../engine/combat';
import { actingPower, productionLeft } from '../engine/game';
import { areAllied, capitalHeld, factoryAt } from '../engine/queries';
import type { Action, Battle, GameState, Power, SpaceId, UnitId, UnitType } from '../engine/types';
import { MapView } from './map/MapView';
import type { Inset, PieceEvent } from './map/MapView';
import { BattleDialog } from './panels/BattleDialog';
import { DecisionView } from './panels/Decisions';
import { LogPanel } from './panels/LogPanel';
import { PhaseBar } from './panels/PhaseBar';
import { SpaceInfo } from './panels/SpaceInfo';
import { TurnCard } from './panels/TurnCard';
import { Help } from './panels/Help';
import { Victory } from './panels/Victory';
import { BuyTray, PlaceTray, placementOptions } from './panels/Tray';
import { forecasts, oddsClass } from './odds';
import { ConfirmEnd } from './panels/ConfirmEnd';
import { endPhaseWarnings } from './warnings';
import { powerName } from './theme';
import { resolveMove } from './paths';
import { dropMoves, dropPreview, grabbable, handReach, pickable, shipmates, stackAt } from './pieces';
import type { Hand } from './pieces';
import { useDrag } from './drag';
import { UnitSvg } from './icons';
import { tally } from './units';
import { cuesBetween, play } from './sound';
import { POWER_STYLE } from './theme';
import { actAll, aiBurst, quickResolve, undo } from './session';
import { autosave, downloadSave } from './saves';
import type { Session } from './session';
import type { RoomConnection } from '../net/client';
import { COMPUTER } from '../net/protocol';
import { SeatStrip } from './panels/Seats';

const AI_DELAY_MS = 120;
const AI_BUDGET_MS = 30;
const TOAST_MS = 4500;
/** Room the raid-or-attack choice needs, so it never opens past the edge of the screen. */
const CHOICE_W = 250;
const CHOICE_H = 100;
/** Width the battle dialog covers on the right, kept clear when the map centers on a battle; phones show it as a bottom sheet. */
const dialogInset = (): Inset => (window.innerWidth > 640 ? { right: 590 } : { bottom: window.innerHeight * 0.5 });

const byOrder = (a: Battle, b: Battle) => a.tier - b.tier || a.id - b.id;

/** The battle a player would naturally fight next: the first one the rules allow, in the rulebook's order. */
function nextBattle(state: GameState, except?: number): Battle | undefined {
  return [...state.battles].sort(byOrder).find((b) => b.id !== except && !b.resolved && battleBlocker(state, b) === null);
}

/** Bombers dropped on an enemy industrial complex may either raid it or join the attack, so the player picks. */
function raidPossible(state: GameState, ids: UnitId[], to: SpaceId): boolean {
  if (state.phase !== 'combatMove') return false;
  const f = factoryAt(state, to);
  if (!f || areAllied(f.owner, state.power)) return false;
  const units = ids.map((id) => state.units.find((u) => u.id === id)!);
  const raiders = state.options.sbrEscortsInterceptors ? ['bomber', 'fighter'] : ['bomber'];
  return units.some((u) => u.type === 'bomber') && units.every((u) => raiders.includes(u.type) && isAir(u.type));
}

const HINT: Partial<Record<GameState['phase'], string>> = {
  purchase: 'Click units in the chart below to buy them; shift-click buys as many as you can afford. They arrive at Mobilize.',
  combatMove:
    'Drag pieces into enemy spaces to attack; shift-drag brings everything in the space. Click a piece to pick up one at a time.',
  noncombatMove: 'Move units that did not attack, and land every plane on friendly ground or a carrier.',
  mobilize: 'Drag new units from the tray onto a highlighted space. Anything left unplaced is refunded.',
};

/** A finger has no shift key, right button or Esc, so touch screens get the gestures they can make. */
const TOUCH = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
const PHASE_HINT: typeof HINT = TOUCH
  ? {
      ...HINT,
      purchase: 'Tap units in the chart below to buy them. They arrive at Mobilize.',
      combatMove:
        'Drag pieces into enemy spaces to attack. Tap a piece to pick up one at a time, or double-tap to take them all.',
    }
  : HINT;
const HAND_HINT = TOUCH
  ? 'Tap a highlighted space to move there, or the space they came from to put them back. Tap a piece for one more.'
  : 'Drop on a highlighted space. Click a piece for one more, right-click to put one back, Esc to let go.';

export type Online = RoomConnection & { room: NonNullable<RoomConnection['room']> };

export function Game({
  session,
  setSession,
  onMenu,
  online,
}: {
  session: Session;
  setSession: (s: Session) => void;
  onMenu: () => void;
  online?: Online;
}) {
  const current = useRef(session);
  current.current = session;
  const [hand, setHand] = useState<Hand | null>(null);
  const [hover, setHover] = useState<SpaceId | null>(null);
  const [raidChoice, setRaidChoice] = useState<{ units: UnitId[]; from: SpaceId; to: SpaceId; x: number; y: number } | null>(
    null,
  );
  const [battleView, setBattleView] = useState<number | null>(null);
  const [toast, setToast] = useState<{ text: string; id: number; info?: boolean } | null>(null);
  const [aiRetry, setAiRetry] = useState(0);
  const [focus, setFocus] = useState<{ id: SpaceId; nonce: number; inset?: Inset } | null>(null);
  const [greeted, setGreeted] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[] | null>(null);
  const [overlay, setOverlay] = useState<'help' | 'log' | null>(null);
  const [lookingAtBoard, setLookingAtBoard] = useState(false);
  const { state, controllers } = session;
  const turnKey = `${state.round}:${state.power}`;
  const greeting = controllers[state.power] === 'human' && greeted !== turnKey && !state.winner;
  // Once someone has won, the board is for looking at only.
  const humanActs = controllers[actingPower(state)] === 'human' && !state.winner;
  const moving = state.phase === 'combatMove' || state.phase === 'noncombatMove';
  const endable = humanActs && state.pending === null && !state.winner && !greeting;

  const commit = useCallback(
    (next: Session) => {
      current.current = next;
      setSession(next);
    },
    [setSession],
  );

  const showError = useCallback((text: string) => setToast({ text, id: Date.now() }), []);
  const send = online?.send;

  const act = useCallback(
    (a: Action | Action[]): boolean => {
      const actions = Array.isArray(a) ? a : [a];
      const r = actAll(current.current, actions);
      if (!r.ok) {
        showError(r.error);
        return false;
      }
      if (!send) {
        commit(r.session);
        return true;
      }
      // Only the server knows the dice, so a roll waits for its answer; everything else shows at once.
      if (r.session.state.rng === current.current.state.rng) commit(r.session);
      send({ t: 'act', actions });
      return true;
    },
    [commit, showError, send],
  );

  useEffect(() => {
    if (!send) autosave(session);
  }, [session, send]);

  const heard = useRef(state);
  useEffect(() => {
    play(cuesBetween(heard.current, state));
    heard.current = state;
  }, [state]);

  const serverError = online?.lastError;
  useEffect(() => {
    if (serverError) setToast({ text: serverError.message, id: serverError.id });
  }, [serverError]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (state.winner || controllers[actingPower(state)] !== 'ai') return;
    const t = setTimeout(() => {
      const r = aiBurst(current.current, AI_BUDGET_MS);
      if (r.ok) return commit(r.session);
      showError(`AI is stuck: ${r.error}`);
      setAiRetry((n) => n + 1);
    }, AI_DELAY_MS);
    return () => clearTimeout(t);
  }, [state, controllers, commit, showError, aiRetry]);

  useEffect(() => {
    const d = state.pending;
    if (d && 'battle' in d) setBattleView(d.battle);
    else if (state.activeBattle !== null) setBattleView(state.activeBattle);
  }, [state.pending, state.activeBattle]);

  useEffect(() => {
    setHand(null);
    setRaidChoice(null);
    setToast(null);
    const first =
      state.phase === 'combat' && controllers[state.power] === 'human' ? nextBattle(current.current.state) : undefined;
    setBattleView(first?.id ?? null);
    // Opening the first battle is a reaction to the phase changing, not to every state update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.power]);

  const reach = useMemo(
    () => (hand?.kind === 'units' && moving ? handReach(state, hand.units, hand.from) : null),
    [hand, moving, state],
  );
  const placements = useMemo(
    () => (hand?.kind === 'new' && state.phase === 'mobilize' ? placementOptions(state, hand.type) : []),
    [hand, state],
  );
  const pendingRetreat = state.pending?.kind === 'retreat' && controllers[state.pending.power] === 'human' ? state.pending : null;
  // Withdrawing planes keeps them in the battle space, so only real destinations are offered on the map.
  const retreat = pendingRetreat && {
    options: pendingRetreat.options.filter((o) => o !== state.battles.find((b) => b.id === pendingRetreat.battle)?.space),
  };
  /** In Mobilize with nothing in hand, every space that can take something bought, so the board shows where to place. */
  const placeable = useMemo(() => {
    if (state.phase !== 'mobilize' || !humanActs || greeting) return [];
    return [...new Set(state.purchases.flatMap((p) => placementOptions(state, p.type).map((o) => o.at)))];
  }, [state, humanActs, greeting]);
  const highlights = useMemo(
    () => reach ?? new Set(retreat ? retreat.options : placements.length > 0 ? placements.map((p) => p.at) : placeable),
    [reach, retreat, placements, placeable],
  );
  /** Where the held units would go if dropped on the hovered space, and the odds of the attack they would make. */
  const preview = useMemo(
    () => (hand?.kind === 'units' && hover && reach?.has(hover) ? dropPreview(state, hand.units, hand.from, hover) : null),
    [hand, hover, reach, state],
  );
  const route = preview?.route ?? null;
  const viewedSpace = state.battles.find((b) => b.id === battleView)?.space;
  useEffect(() => {
    if (viewedSpace) setFocus({ id: viewedSpace, nonce: Date.now(), inset: dialogInset() });
  }, [viewedSpace]);
  const revealed = useMemo(() => (placements.length > 0 ? placements.map((p) => p.at) : placeable), [placements, placeable]);
  const held = useMemo(() => new Set(hand?.kind === 'units' ? hand.units : []), [hand]);
  const odds = useMemo(() => (humanActs ? forecasts(state) : []), [state, humanActs]);
  const tags = useMemo(() => {
    const out = new Map<SpaceId, { text: string; tone: string }>();
    for (const f of odds)
      if (f.kind === 'sbr') out.set(f.space, out.get(f.space) ?? { text: `~${f.defLoss.toFixed(1)} dmg`, tone: 'good' });
      else out.set(f.space, { text: `${Math.round(f.win * 100)}%`, tone: oddsClass(f.win) });
    const p = preview?.odds;
    if (p) out.set(p.space, { text: `${Math.round(p.win * 100)}% if you go`, tone: `${oddsClass(p.win)} preview` });
    return out;
  }, [odds, preview]);

  const moveHand = useCallback(
    (units: UnitId[], from: SpaceId, to: SpaceId, sbr: boolean, dropped = false): boolean => {
      const r = dropMoves(current.current.state, units, from, to, sbr);
      if (!r.ok) {
        showError(r.error);
        if (dropped) setHand(null);
        return false;
      }
      if (!act(r.moves.map((m) => ({ type: 'move' as const, ...m })))) return false;
      const moved = new Set(r.moves.flatMap((m) => m.units));
      const left = units.filter((id) => !moved.has(id));
      const transport = (id: UnitId) =>
        !units.includes(id) && current.current.state.units.find((u) => u.id === id)?.type === 'transport';
      const sail = r.moves.find((m) => m.units.every(transport));
      if (left.length > 0) {
        const after = current.current.state;
        const why = resolveMove(after, { units: left, sbr }, from, to);
        const names = tally(after.units.filter((u) => left.includes(u.id)))
          .map((t) => unitCount(t.count, t.type))
          .join(', ');
        setToast({ text: `${names} stayed in ${from}${why.ok ? '' : `: ${why.error}`}`, id: Date.now(), info: true });
      } else if (sail)
        setToast({ text: `The transport sailed to ${sail.path[sail.path.length - 1]} to land them`, id: Date.now(), info: true });
      setHand(null);
      return true;
    },
    [act, showError],
  );

  const playHand = (hand: Hand, to: SpaceId, x: number, y: number, dropped = false) => {
    if (hand.kind === 'new') {
      const opt = placementOptions(state, hand.type).find((p) => p.at === to);
      if (!opt) return showError(`A new ${hand.type === 'factory' ? 'industrial complex' : hand.type} cannot be placed in ${to}`);
      const before = state.placements;
      if (!act({ type: 'place', unitType: hand.type, at: to, count: Math.min(hand.count, opt.max) })) return;
      setHand(null);
      // The map moves on to factories with room left, so say why this one stopped taking units.
      const after = current.current.state;
      const full = Object.keys(after.placements).filter(
        (f) => after.placements[f] !== before[f] && productionLeft(after, f) === 0,
      );
      if (full.length > 0 && after.purchases.length > 0)
        setToast({
          text: `${full.join(' and ')} has placed all it can this turn (ships launched from it count too)`,
          id: Date.now(),
          info: true,
        });
      return;
    }
    if (to === hand.from) return setHand(null);
    if (raidPossible(state, hand.units, to)) return setRaidChoice({ units: hand.units, from: hand.from, to, x, y });
    moveHand(hand.units, hand.from, to, false, dropped);
  };

  const last = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const at = (e: PointerEvent) => (last.current = { x: e.clientX, y: e.clientY });
    window.addEventListener('pointerdown', at);
    return () => window.removeEventListener('pointerdown', at);
  }, []);
  const pending = useRef<{ kind: 'units'; space: SpaceId; ids: UnitId[] } | { kind: 'new'; type: UnitType } | null>(null);
  const dragged = useRef<Hand | null>(null);
  const drag = useDrag({
    onStart: () => {
      const p = pending.current;
      if (!p) return false;
      const left = p.kind === 'new' ? (state.purchases.find((x) => x.type === p.type)?.count ?? 0) : 0;
      const h: Hand =
        p.kind === 'new'
          ? hand?.kind === 'new' && hand.type === p.type
            ? hand
            : { kind: 'new', type: p.type, count: left }
          : hand?.kind === 'units' && hand.from === p.space && hand.units.some((id) => p.ids.includes(id))
            ? hand
            : { kind: 'units', from: p.space, units: p.ids };
      dragged.current = h;
      setHand(h);
      return true;
    },
    onOver: setHover,
    onDrop: (to) => {
      const h = dragged.current;
      pending.current = null;
      dragged.current = null;
      if (h && !to) setToast({ text: 'Dropped off the board, so nothing moved', id: Date.now(), info: true });
      if (!h || !to || (h.kind === 'units' && to === h.from)) return setHand(null);
      playHand(h, to, drag.at?.x ?? 0, drag.at?.y ?? 0, true);
    },
  });

  const onPieceDown = (space: SpaceId, key: string, x: number, y: number, shift: boolean): boolean => {
    if (!humanActs || !moving || state.pending) return false;
    const st = stackAt(state, space, key);
    const picked = st ? grabbable(state, st) : [];
    if (picked.length === 0) return false;
    const everything = state.units.filter((u) => u.at === space && !u.carriedBy && pickable(state, u)).map((u) => u.id);
    const ids = !shift ? picked : st?.carried ? shipmates(state, picked) : everything;
    pending.current = { kind: 'units', space, ids };
    drag.begin(x, y);
    return true;
  };

  const onPiece = (e: PieceEvent) => {
    const st = humanActs && moving && !state.pending ? stackAt(state, e.space, e.stack) : undefined;
    const ids = st ? grabbable(state, st) : [];
    const elsewhere = hand?.kind === 'units' && hand.from !== e.space;
    if (ids.length === 0 || (elsewhere && reach?.has(e.space))) return onSpace(e.space);
    const mine = hand?.kind === 'units' && hand.from === e.space ? hand.units : [];
    const inStack = mine.filter((id) => ids.includes(id));
    const others = mine.filter((id) => !ids.includes(id));
    const count = e.all ? (e.putBack ? 0 : ids.length) : Math.max(0, Math.min(ids.length, inStack.length + (e.putBack ? -1 : 1)));
    const next = [...others, ...ids.slice(0, count)];
    setHand(next.length > 0 ? { kind: 'units', from: e.space, units: next } : null);
  };

  const onSpace = (id: SpaceId) => {
    if (retreat?.options.includes(id)) return act({ type: 'retreat', to: id });
    if (humanActs && hand) return playHand(hand, id, last.current.x, last.current.y);
    const b = state.battles.find((x) => x.space === id && !x.resolved) ?? state.battles.find((x) => x.space === id);
    if (state.phase === 'combat' && b) return setBattleView(b.id);
    // A touch screen has no hover, so a tap is how a player reads a space.
    setHover(id);
  };

  // A battle being finished automatically: it makes the attacker's choices, waits while a human defender makes theirs,
  // then carries on.
  const [autoBattle, setAutoBattle] = useState<number | null>(null);
  const quick = useCallback(
    (battle: number) => {
      setAutoBattle(battle);
      setBattleView(battle);
      if (send) return send({ t: 'resolve', battle });
      const s = current.current;
      const attacker = s.state.battles.find((b) => b.id === battle)?.attacker;
      const r = quickResolve(s, battle, (p) => p === attacker || s.controllers[p] !== 'human');
      if (!r.ok) {
        setAutoBattle(null);
        return showError(r.error);
      }
      commit(r.session);
    },
    [commit, showError, send],
  );
  useEffect(() => setAutoBattle(null), [serverError]);
  useEffect(() => {
    if (autoBattle === null) return;
    const b = state.battles.find((x) => x.id === autoBattle);
    if (!b || b.resolved) return setAutoBattle(null);
    const d = state.pending;
    if (d && 'battle' in d && d.battle === autoBattle && d.power === b.attacker && controllers[d.power] === 'human')
      quick(autoBattle);
  }, [state, autoBattle, controllers, quick]);

  // The turn card already sits over the new power's home, so the player is oriented before pressing Start.
  useEffect(() => {
    if (greeting) setFocus({ id: CAPITAL_OF[state.power], nonce: Date.now() });
  }, [greeting, state.power]);

  const startTurn = useCallback(() => {
    setGreeted(turnKey);
    setFocus(
      viewedSpace
        ? { id: viewedSpace, nonce: Date.now(), inset: dialogInset() }
        : { id: CAPITAL_OF[state.power], nonce: Date.now() },
    );
  }, [turnKey, state.power, viewedSpace]);

  const canUndo = online ? online.room.canUndo && controllers[state.power] === 'human' : session.undo.length > 0;
  const onUndo = useCallback(() => {
    if (!canUndo) return;
    setHand(null);
    if (send) {
      send({ t: 'undo' });
      return setToast({ text: 'Last move undone', id: Date.now(), info: true });
    }
    const now = current.current.state;
    const back = undo(current.current);
    commit(back);
    const where = new Map(now.units.map((u) => [u.id, u.at]));
    const returned = back.state.units.filter((u) => where.get(u.id) !== u.at && u.carriedBy === null);
    const to = returned[0]?.at;
    const names = tally(returned)
      .map((t) => unitCount(t.count, t.type))
      .join(', ');
    setToast({ text: to ? `Undone: ${names} back in ${to}` : 'Last move undone', id: Date.now(), info: true });
  }, [commit, send, canUndo]);

  const endPhase = useCallback(() => {
    setWarnings(null);
    if (act({ type: 'endPhase' })) setHand(null);
  }, [act]);

  const onEndPhase = useCallback(() => {
    const w = endPhaseWarnings(current.current.state);
    if (w.length > 0) setWarnings(w);
    else endPhase();
  }, [endPhase]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        onUndo();
      } else if (e.key === 'Escape') {
        setHand(null);
        setRaidChoice(null);
      } else if (e.key === '?') setOverlay('help');
      else if (e.key === 'l' && !e.metaKey && !e.ctrlKey) setOverlay((o) => (o === 'log' ? null : 'log'));
      else if (e.key === 'e' && !e.metaKey && !e.ctrlKey && endable) onEndPhase();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onUndo, onEndPhase, endable]);

  const playing = (p: Power) => {
    if (controllers[p] === 'ai' || online?.room.seats[p] === COMPUTER) return `${powerName(p)} (computer)`;
    const holder = online?.room.players.find((x) => x.id === online.room.seats[p]);
    if (holder) return `${powerName(p)} (${holder.name})`;
    return online ? `${powerName(p)}, an open seat: take it above or hand it to the computer` : powerName(p);
  };
  const viewed = battleView !== null ? state.battles.find((b) => b.id === battleView) : undefined;
  const stranded = state.pending?.kind === 'landStranded' ? state.pending : null;
  const openBattles = state.battles.some((b) => !b.resolved);
  const hint = state.winner
    ? `The ${state.winner} won. Open the ☰ menu for a new game.`
    : !humanActs
      ? online && !online.room.seats[actingPower(state)]
        ? `Nobody holds ${powerName(actingPower(state))} yet. Click its seat above to play it or hand it to the computer, or invite a friend.`
        : `${playing(actingPower(state))} is playing…`
      : hand?.kind === 'units'
        ? HAND_HINT
        : state.phase === 'combat'
          ? openBattles
            ? 'Click a ⚔ to fight that battle.'
            : 'Every battle is fought. End the phase.'
          : state.phase === 'purchase' && !capitalHeld(state, state.power)
            ? undefined
            : PHASE_HINT[state.phase];
  const style = POWER_STYLE[state.power];

  return (
    <div className="app">
      <PhaseBar
        state={state}
        controllers={controllers}
        canUndo={canUndo}
        onEndPhase={onEndPhase}
        onUndo={onUndo}
        onExport={() => downloadSave(session)}
        onMenu={onMenu}
        onHelp={() => setOverlay('help')}
        onLog={() => setOverlay('log')}
      />
      {online && (
        <SeatStrip
          room={online.room}
          me={online.me}
          status={online.status}
          send={online.send}
          onInfo={(text) => setToast({ text, id: Date.now(), info: true })}
        />
      )}
      <div className="main">
        <MapView
          state={state}
          selected={hand?.kind === 'units' ? hand.from : null}
          highlights={highlights}
          held={held}
          tags={tags}
          route={route}
          onSpace={onSpace}
          onPiece={onPiece}
          onPieceDown={onPieceDown}
          onHover={setHover}
          onBackground={() => setHand(null)}
          focus={focus}
          reveal={revealed}
          animate={!humanActs}
        />
        {hover && !drag.at && !viewed && <SpaceInfo state={state} id={hover} />}
        {hint && !viewed && <div className="hint-line">{hint}</div>}
        {humanActs && state.phase === 'purchase' && !greeting && <BuyTray state={state} act={act} />}
        {humanActs && state.phase === 'mobilize' && !greeting && (
          <PlaceTray
            state={state}
            hand={hand}
            onPick={(type, count) => setHand(count > 0 ? { kind: 'new', type, count } : null)}
            onDragStart={(type, x, y) => {
              pending.current = { kind: 'new', type };
              drag.begin(x, y);
            }}
          />
        )}
        {drag.at && hand && (
          <div className="ghost" style={{ left: drag.at.x, top: drag.at.y }}>
            {hand.kind === 'new' ? (
              <>
                <UnitSvg type={hand.type} color={style.color} size={30} />
                <span>{hand.count}</span>
              </>
            ) : (
              tally(state.units.filter((u) => held.has(u.id))).map((t) => (
                <span key={t.type} className="ghost-part">
                  <UnitSvg type={t.type} color={style.color} size={26} />
                  {t.count > 1 && t.count}
                </span>
              ))
            )}
          </div>
        )}
        {raidChoice && (
          <div
            className="choice"
            style={{
              left: Math.min(raidChoice.x, window.innerWidth - CHOICE_W),
              top: Math.min(raidChoice.y, window.innerHeight - CHOICE_H),
            }}
          >
            <button
              className="primary"
              autoFocus
              onClick={() => {
                setRaidChoice(null);
                moveHand(raidChoice.units, raidChoice.from, raidChoice.to, true);
              }}
            >
              Bomb the industrial complex
            </button>
            <button
              onClick={() => {
                setRaidChoice(null);
                moveHand(raidChoice.units, raidChoice.from, raidChoice.to, false);
              }}
            >
              Attack {raidChoice.to}
            </button>
          </div>
        )}
        {viewed && (
          <BattleDialog
            state={state}
            battle={viewed}
            fallen={session.fallen}
            controllers={controllers}
            playing={playing}
            act={act}
            onQuick={quick}
            onClose={() => setBattleView(null)}
            forecast={odds.find((f) => f.space === viewed.space && f.kind === viewed.kind)}
            next={nextBattle(state, viewed.id)}
            onOpen={setBattleView}
          />
        )}
        {stranded && controllers[stranded.power] === 'human' && (
          <div className="battle-dialog">
            <DecisionView state={state} d={stranded} act={act} />
          </div>
        )}
        {toast && (
          <div key={toast.id} className={toast.info ? 'toast info' : 'toast'} onClick={() => setToast(null)}>
            {toast.text}
          </div>
        )}
        {greeting && !overlay && <TurnCard state={state} onStart={startTurn} />}
        {overlay === 'help' && <Help options={state.options} onClose={() => setOverlay(null)} />}
        {overlay === 'log' && <LogPanel lines={state.log} onClose={() => setOverlay(null)} />}
        {warnings && <ConfirmEnd warnings={warnings} onConfirm={endPhase} onCancel={() => setWarnings(null)} />}
        {state.winner && !lookingAtBoard && (
          <Victory state={state} winner={state.winner} onMenu={onMenu} onLook={() => setLookingAtBoard(true)} />
        )}
      </div>
    </div>
  );
}
