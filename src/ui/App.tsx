import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CAPITAL_OF, isAir } from '../engine/data';
import { battleBlocker } from '../engine/combat';
import { actingPower } from '../engine/game';
import { areAllied, factoryAt } from '../engine/queries';
import type { Action, Battle, GameState, SpaceId, UnitId, UnitType } from '../engine/types';
import { MapView } from './map/MapView';
import type { PieceEvent } from './map/MapView';
import { BattleDialog } from './panels/BattleDialog';
import { DecisionView } from './panels/Decisions';
import { LogPanel } from './panels/LogPanel';
import { PhaseBar } from './panels/PhaseBar';
import { SetupScreen } from './panels/SetupScreen';
import { SpaceInfo } from './panels/SpaceInfo';
import { TurnCard } from './panels/TurnCard';
import { Help } from './panels/Help';
import { BuyTray, PlaceTray, placementOptions } from './panels/Tray';
import { forecasts, oddsClass } from './odds';
import { ConfirmEnd } from './panels/ConfirmEnd';
import { endPhaseWarnings } from './warnings';
import { powerName } from './theme';
import { reachable } from './paths';
import { dropMoves, grabbable, stackAt } from './pieces';
import type { Hand } from './pieces';
import { useDrag } from './drag';
import { UnitSvg } from './icons';
import { POWER_STYLE } from './theme';
import { act as step, aiBurst, autosave, downloadSave, loadAutosave, quickResolve, undo } from './session';
import type { Session } from './session';

const AI_DELAY_MS = 120;
const AI_BUDGET_MS = 30;
const TOAST_MS = 4500;

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  if (!session) return <SetupScreen saved={loadAutosave()} onStart={setSession} />;
  return <Game session={session} setSession={setSession} onMenu={() => setSession(null)} />;
}

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
  combatMove: 'Drag pieces into enemy spaces to attack. Click a piece to pick up one at a time; shift-click takes the stack.',
  noncombatMove: 'Move units that did not attack, and land every plane on friendly ground or a carrier.',
};

function Game({ session, setSession, onMenu }: { session: Session; setSession: (s: Session) => void; onMenu: () => void }) {
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
  const [focus, setFocus] = useState<{ id: SpaceId; nonce: number } | null>(null);
  const [greeted, setGreeted] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[] | null>(null);
  const [overlay, setOverlay] = useState<'help' | 'log' | null>(null);
  const { state, controllers } = session;
  const turnKey = `${state.round}:${state.power}`;
  const greeting = controllers[state.power] === 'human' && greeted !== turnKey && !state.winner;
  const humanActs = controllers[actingPower(state)] === 'human';
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

  const act = useCallback(
    (a: Action): boolean => {
      const r = step(current.current, a);
      if (!r.ok) {
        showError(r.error);
        return false;
      }
      commit(r.session);
      return true;
    },
    [commit, showError],
  );

  useEffect(() => {
    autosave(session);
  }, [session]);

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
    const first =
      state.phase === 'combat' && controllers[state.power] === 'human' ? nextBattle(current.current.state) : undefined;
    setBattleView(first?.id ?? null);
    // Opening the first battle is a reaction to the phase changing, not to every state update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.power]);

  const reach = useMemo(
    () => (hand?.kind === 'units' && moving ? reachable(state, { units: hand.units, sbr: false }, hand.from) : null),
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
  const highlights = useMemo(
    () => reach ?? new Set(retreat ? retreat.options : placements.map((p) => p.at)),
    [reach, retreat, placements],
  );
  const route = useMemo(() => {
    if (hand?.kind !== 'units' || !hover || !reach?.has(hover)) return null;
    const r = dropMoves(state, hand.units, hand.from, hover, false);
    return r.ok ? r.moves[0]!.path : null;
  }, [hand, hover, reach, state]);
  const held = useMemo(() => new Set(hand?.kind === 'units' ? hand.units : []), [hand]);
  const odds = useMemo(() => (humanActs ? forecasts(state) : []), [state, humanActs]);
  const tags = useMemo(() => {
    const out = new Map<SpaceId, { text: string; tone: string }>();
    for (const f of odds)
      if (f.kind === 'sbr') out.set(f.space, out.get(f.space) ?? { text: `~${f.defLoss.toFixed(1)} dmg`, tone: 'good' });
      else out.set(f.space, { text: `${Math.round(f.win * 100)}%`, tone: oddsClass(f.win) });
    return out;
  }, [odds]);

  const moveHand = useCallback(
    (units: UnitId[], from: SpaceId, to: SpaceId, sbr: boolean): boolean => {
      const r = dropMoves(current.current.state, units, from, to, sbr);
      if (!r.ok) {
        showError(r.error);
        return false;
      }
      for (const m of r.moves) if (!act({ type: 'move', ...m })) return false;
      const moved = r.moves.reduce((n, m) => n + m.units.length, 0);
      if (moved < units.length)
        setToast({ text: `${units.length - moved} could not reach ${to} and stayed behind`, id: Date.now(), info: true });
      setHand(null);
      return true;
    },
    [act, showError],
  );

  const playHand = (hand: Hand, to: SpaceId, x: number, y: number) => {
    if (hand.kind === 'new') {
      const opt = placementOptions(state, hand.type).find((p) => p.at === to);
      if (!opt) return showError(`A new ${hand.type === 'factory' ? 'industrial complex' : hand.type} cannot be placed in ${to}`);
      if (act({ type: 'place', unitType: hand.type, at: to, count: Math.min(hand.count, opt.max) })) setHand(null);
      return;
    }
    if (to === hand.from) return setHand(null);
    if (raidPossible(state, hand.units, to)) return setRaidChoice({ units: hand.units, from: hand.from, to, x, y });
    moveHand(hand.units, hand.from, to, false);
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
      if (!h || !to || (h.kind === 'units' && to === h.from)) return setHand(null);
      playHand(h, to, drag.at?.x ?? 0, drag.at?.y ?? 0);
    },
  });

  const onPieceDown = (space: SpaceId, key: string, x: number, y: number): boolean => {
    if (!humanActs || !moving || state.pending) return false;
    const st = stackAt(state, space, key);
    const ids = st ? grabbable(state, st) : [];
    if (ids.length === 0) return false;
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
  };

  const quick = useCallback(
    (battle: number) => {
      const r = quickResolve(current.current, battle);
      if (!r.ok) return showError(r.error);
      commit(r.session);
      setBattleView(battle);
    },
    [commit, showError],
  );

  const startTurn = useCallback(() => {
    setGreeted(turnKey);
    setFocus({ id: CAPITAL_OF[state.power], nonce: Date.now() });
  }, [turnKey, state.power]);

  const onUndo = useCallback(() => {
    if (current.current.undo.length === 0) return;
    commit(undo(current.current));
    setHand(null);
    setToast({ text: 'Last move undone', id: Date.now(), info: true });
  }, [commit]);

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

  const viewed = battleView !== null ? state.battles.find((b) => b.id === battleView) : undefined;
  const stranded = state.pending?.kind === 'landStranded' ? state.pending : null;
  const openBattles = state.battles.some((b) => !b.resolved);
  const hint = !humanActs
    ? `${powerName(actingPower(state))} (computer) is playing…`
    : hand?.kind === 'units'
      ? 'Drop on a highlighted space. Click a piece for one more, right-click to put one back, Esc to let go.'
      : state.phase === 'combat'
        ? openBattles
          ? 'Click a ⚔ to fight that battle.'
          : 'Every battle is fought. End the phase.'
        : HINT[state.phase];
  const style = POWER_STYLE[state.power];

  return (
    <div className="app">
      <PhaseBar
        state={state}
        controllers={controllers}
        canUndo={session.undo.length > 0}
        onEndPhase={onEndPhase}
        onUndo={onUndo}
        onExport={() => downloadSave(session)}
        onMenu={onMenu}
        onHelp={() => setOverlay('help')}
        onLog={() => setOverlay('log')}
      />
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
            <UnitSvg
              type={hand.kind === 'new' ? hand.type : (state.units.find((u) => u.id === hand.units[0])?.type ?? 'infantry')}
              color={style.color}
              size={30}
            />
            <span>{hand.kind === 'new' ? hand.count : hand.units.length}</span>
          </div>
        )}
        {raidChoice && (
          <div className="choice" style={{ left: raidChoice.x, top: raidChoice.y }}>
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
            act={act}
            onQuick={quick}
            onClose={() => setBattleView(null)}
            forecast={odds.find((f) => f.space === viewed.space && f.kind === viewed.kind)}
            next={nextBattle(state, viewed.id)}
            onOpen={(id) => {
              setBattleView(id);
              const b = state.battles.find((x) => x.id === id);
              if (b) setFocus({ id: b.space, nonce: Date.now() });
            }}
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
        {state.winner && (
          <div className="winner">
            <h1>The {state.winner} win!</h1>
            <button className="primary" onClick={onMenu}>
              New game
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
