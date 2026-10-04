import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CAPITAL_OF } from '../engine/data';
import { actingPower } from '../engine/game';
import { remainingMove } from '../engine/queries';
import type { Action, SpaceId, UnitId, UnitType } from '../engine/types';
import { MapView } from './map/MapView';
import { BattleDialog } from './panels/BattleDialog';
import { CombatPanel } from './panels/CombatPanel';
import { DecisionView } from './panels/Decisions';
import { LogPanel } from './panels/LogPanel';
import { MobilizePanel, placementOptions } from './panels/MobilizePanel';
import { MovePanel } from './panels/MovePanel';
import { PhaseBar } from './panels/PhaseBar';
import { PurchasePanel } from './panels/PurchasePanel';
import { SetupScreen } from './panels/SetupScreen';
import { SpaceInfo } from './panels/SpaceInfo';
import { TurnCard } from './panels/TurnCard';
import { AttackPlan } from './panels/AttackPlan';
import { forecasts } from './odds';
import { ConfirmEnd } from './panels/ConfirmEnd';
import { endPhaseWarnings } from './warnings';
import { PHASE_GUIDE, powerName } from './theme';
import { reachable, resolveMove } from './paths';
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

function Game({ session, setSession, onMenu }: { session: Session; setSession: (s: Session) => void; onMenu: () => void }) {
  const current = useRef(session);
  current.current = session;
  const [inspect, setInspect] = useState<SpaceId | null>(null);
  const [selected, setSelected] = useState<UnitId[]>([]);
  const [sbr, setSbr] = useState(false);
  const [placeType, setPlaceType] = useState<UnitType | null>(null);
  const [battleView, setBattleView] = useState<number | null>(null);
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  const [aiRetry, setAiRetry] = useState(0);
  const [focus, setFocus] = useState<{ id: SpaceId; nonce: number } | null>(null);
  const [greeted, setGreeted] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[] | null>(null);
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
    setSelected([]);
    setSbr(false);
    if (state.phase !== 'combat') setBattleView(null);
  }, [state.phase, state.power]);

  useEffect(() => {
    if (state.phase !== 'mobilize') return;
    if (!placeType || !state.purchases.some((p) => p.type === placeType)) setPlaceType(state.purchases[0]?.type ?? null);
  }, [state.phase, state.purchases, placeType]);

  const intent = useMemo(() => ({ units: selected, sbr }), [selected, sbr]);
  const reach = useMemo(
    () => (moving && inspect && selected.length > 0 ? reachable(state, intent, inspect) : new Set<SpaceId>()),
    [moving, inspect, selected.length, state, intent],
  );
  const odds = useMemo(() => (humanActs ? forecasts(state) : []), [state, humanActs]);
  const placements = useMemo(
    () => (state.phase === 'mobilize' && placeType && humanActs ? placementOptions(state, placeType) : []),
    [state, placeType, humanActs],
  );
  const highlights = useMemo(
    () => (state.phase === 'mobilize' ? new Set(placements.map((p) => p.at)) : reach),
    [state.phase, placements, reach],
  );

  const inspectSpace = (id: SpaceId | null) => {
    setInspect(id);
    setSelected([]);
    setSbr(false);
  };

  const onSpace = (id: SpaceId) => {
    if (humanActs && state.phase === 'mobilize' && placeType && highlights.has(id)) {
      act({ type: 'place', unitType: placeType, at: id, count: 1 });
      return;
    }
    if (humanActs && moving && inspect && selected.length > 0 && id !== inspect) {
      const r = resolveMove(state, intent, inspect, id);
      if (!r.ok) return showError(r.error);
      for (const m of r.moves) if (!act({ type: 'move', ...m })) return;
      const after = current.current.state;
      const left = after.units.some(
        (u) => u.at === inspect && u.owner === after.power && u.type !== 'factory' && remainingMove(u) > 0,
      );
      inspectSpace(left ? inspect : id);
      return;
    }
    if (id !== inspect) inspectSpace(id);
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
    setInspect(CAPITAL_OF[state.power]);
    setFocus({ id: CAPITAL_OF[state.power], nonce: Date.now() });
  }, [turnKey, state.power]);

  const onUndo = useCallback(() => {
    if (current.current.undo.length === 0) return;
    commit(undo(current.current));
    setSelected([]);
  }, [commit]);

  const endPhase = useCallback(() => {
    setWarnings(null);
    if (act({ type: 'endPhase' })) setSelected([]);
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
      } else if (e.key === 'Escape') setSelected([]);
      else if (e.key === 'e' && !e.metaKey && !e.ctrlKey && endable) onEndPhase();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onUndo, onEndPhase, endable]);

  const viewed = battleView !== null ? state.battles.find((b) => b.id === battleView) : undefined;
  const stranded = state.pending?.kind === 'landStranded' ? state.pending : null;
  const focusOn = (id: SpaceId) => {
    setInspect(id);
    setFocus({ id, nonce: Date.now() });
  };

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
      />
      <div className="main">
        <MapView
          state={state}
          selected={inspect}
          highlights={highlights}
          onSpace={onSpace}
          onBackground={() => inspectSpace(null)}
          focus={focus}
        />
        <aside className="sidebar">
          {!humanActs && !state.winner && (
            <section className="panel thinking">{powerName(actingPower(state))} (computer) is playing…</section>
          )}
          {humanActs && !state.winner && <section className="panel guide">{PHASE_GUIDE[state.phase]}</section>}
          {humanActs && state.phase === 'purchase' && <PurchasePanel state={state} act={act} />}
          {humanActs && state.phase === 'combatMove' && <AttackPlan forecasts={odds} onFocus={focusOn} />}
          {state.phase === 'combat' && (
            <CombatPanel state={state} odds={odds} act={act} onQuick={quick} onView={setBattleView} onFocus={focusOn} />
          )}
          {humanActs && state.phase === 'mobilize' && (
            <MobilizePanel state={state} type={placeType} options={placements} onType={setPlaceType} act={act} />
          )}
          {humanActs && moving && !stranded && inspect && (
            <MovePanel state={state} at={inspect} selected={selected} sbr={sbr} onSelect={setSelected} onSbr={setSbr} />
          )}
          {humanActs && moving && !inspect && <section className="panel hint">Click a space to pick units to move.</section>}
          {inspect && !(humanActs && moving) && <SpaceInfo state={state} id={inspect} />}
          <LogPanel lines={state.log} />
        </aside>
        {viewed && (
          <BattleDialog
            state={state}
            battle={viewed}
            fallen={session.fallen}
            controllers={controllers}
            act={act}
            onQuick={quick}
            onClose={() => setBattleView(null)}
          />
        )}
        {stranded && controllers[stranded.power] === 'human' && (
          <div className="battle-dialog">
            <DecisionView state={state} d={stranded} act={act} />
          </div>
        )}
        {toast && (
          <div key={toast.id} className="toast" onClick={() => setToast(null)}>
            {toast.text}
          </div>
        )}
        {greeting && <TurnCard state={state} onStart={startTurn} />}
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
