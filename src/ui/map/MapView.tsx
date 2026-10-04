import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react';
import type { GameState, SpaceId } from '../../engine/types';
import { CENTER, MAP_HEIGHT, MAP_WIDTH } from './geometry';
import { NeutralPattern, TrailHead, World } from './World';
import type { WorldProps } from './World';

interface View {
  tx: number;
  ty: number;
  k: number;
}

export interface PieceEvent {
  space: SpaceId;
  stack: string;
  /** Take or drop the whole stack rather than one piece. */
  all: boolean;
  /** Put a piece back instead of taking one. */
  putBack: boolean;
}

interface Props extends Omit<WorldProps, 'captured'> {
  onSpace: (id: SpaceId) => void;
  onPiece: (e: PieceEvent) => void;
  /** A press on a piece; returning true means the piece can be dragged, so the map does not pan. */
  onPieceDown: (space: SpaceId, stack: string, x: number, y: number, shift: boolean) => boolean;
  onHover: (id: SpaceId | null) => void;
  onBackground: () => void;
  /** Changing this value recenters the map on the space. */
  focus: { id: SpaceId; nonce: number; inset?: Inset } | null;
  /** Spaces the player now needs to see; the map pans to the nearest one only if none is on screen. */
  reveal: readonly SpaceId[];
}

const MAX_ZOOM = 4;
const CAPTURE_MS = 1800;

/** Territories whose owner just changed, held for one pulse of the capture animation. */
function useCaptured(owner: GameState['owner']): ReadonlySet<SpaceId> {
  const [captured, setCaptured] = useState<ReadonlySet<SpaceId>>(new Set());
  const last = useRef(owner);
  useEffect(() => {
    const changed = Object.keys(owner).filter((id) => owner[id] !== last.current[id]);
    last.current = owner;
    if (changed.length === 0) return;
    setCaptured(new Set(changed));
    const t = setTimeout(() => setCaptured(new Set()), CAPTURE_MS);
    return () => clearTimeout(t);
  }, [owner]);
  return captured;
}
const DRAG_SLOP = 4;
const START_ZOOM = 1.35;
/** Smaller screens open zoomed out in proportion, but not so far that pieces become too small to touch. */
const startZoom = (w: number, h: number) => START_ZOOM * Math.max(0.6, Math.min(1, w / 1440, h / 840));

function normalize(v: View, w: number, h: number): View {
  const minK = Math.max(w / MAP_WIDTH, h / MAP_HEIGHT, 0.05);
  const k = Math.min(MAX_ZOOM, Math.max(minK, v.k));
  const span = MAP_WIDTH * k;
  const tx = (((v.tx % span) + span) % span) - span;
  const ty = Math.min(0, Math.max(h - MAP_HEIGHT * k, v.ty));
  return { tx, ty, k };
}

/** Pixels a dialog covers on the right or along the bottom of the map. */
export interface Inset {
  right?: number;
  bottom?: number;
}

/** Center a space in the part of the map a dialog leaves uncovered. */
function centeredOn(id: SpaceId, k: number, w: number, h: number, inset: Inset = {}): View {
  const [x, y] = CENTER.get(id) ?? [MAP_WIDTH / 2, MAP_HEIGHT / 2];
  return normalize({ tx: (w - (inset.right ?? 0)) / 2 - x * k, ty: (h - (inset.bottom ?? 0)) / 2 - y * k, k }, w, h);
}

const NEAR_PX = 14;

/** The piece nearest a press that just missed one, so a slightly-off grab still picks it up instead of panning. */
function pieceNear(x: number, y: number): { space: SpaceId; stack: string } | null {
  let best: { el: Element; d: number } | null = null;
  for (const el of document.querySelectorAll('.map [data-stack]')) {
    const r = el.getBoundingClientRect();
    const d = Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
    if (d <= NEAR_PX && (!best || d < best.d)) best = { el, d };
  }
  return best ? pieceOf(best.el) : null;
}

function pieceOf(target: EventTarget): { space: SpaceId; stack: string } | null {
  const el = (target as Element).closest('[data-stack]');
  const space = el?.closest('[data-space]')?.getAttribute('data-space');
  const stack = el?.getAttribute('data-stack');
  return space && stack ? { space, stack } : null;
}

export function MapView({ onSpace, onPiece, onPieceDown, onHover, onBackground, focus, reveal, ...world }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1000, h: 700 });
  const [view, setView] = useState<View | null>(null);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!focus) return;
    setView((v) => centeredOn(focus.id, v?.k ?? startZoom(size.w, size.h), size.w, size.h, focus.inset));
  }, [focus, size.w, size.h]);

  const revealKey = reveal.join('|');
  useEffect(() => {
    if (reveal.length === 0) return;
    setView((cur) => {
      const base = normalize(cur ?? centeredOn('Germany', startZoom(size.w, size.h), size.w, size.h), size.w, size.h);
      const span = MAP_WIDTH * base.k;
      const onScreen = (id: SpaceId) => {
        const [x, y] = CENTER.get(id) ?? [0, 0];
        const sx = (((x * base.k + base.tx) % span) + span) % span;
        const sy = y * base.k + base.ty;
        return { sx, sy, seen: sx > 40 && sx < size.w - 40 && sy > 40 && sy < size.h - 140 };
      };
      if (reveal.some((id) => onScreen(id).seen)) return cur;
      const near = [...reveal].sort((a, b) => {
        const d = (id: SpaceId) => {
          const p = onScreen(id);
          return Math.min(Math.abs(p.sx - size.w / 2), span - Math.abs(p.sx - size.w / 2)) + Math.abs(p.sy - size.h / 2);
        };
        return d(a) - d(b);
      })[0]!;
      return centeredOn(near, base.k, size.w, size.h);
    });
    // The list is compared by value so a re-render with the same spaces does not pan again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealKey, size.w, size.h]);

  const v = normalize(view ?? centeredOn('Germany', startZoom(size.w, size.h), size.w, size.h), size.w, size.h);

  const zoomAt = (factor: number, px: number, py: number) =>
    setView((cur) => {
      const base = normalize(cur ?? v, size.w, size.h);
      const k = normalize({ ...base, k: base.k * factor }, size.w, size.h).k;
      const f = k / base.k;
      return normalize({ tx: px - (px - base.tx) * f, ty: py - (py - base.ty) * f, k }, size.w, size.h);
    });
  const zoomRef = useRef(zoomAt);
  zoomRef.current = zoomAt;
  const panRef = useRef((_dx: number, _dy: number) => {});
  panRef.current = (dx, dy) =>
    setView((cur) => {
      const base = normalize(cur ?? v, size.w, size.h);
      return normalize({ ...base, tx: base.tx + dx, ty: base.ty + dy }, size.w, size.h);
    });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      // A pinch (ctrlKey) or a notched mouse wheel zooms; a trackpad's two-finger scroll pans like dragging.
      const wheel = e.deltaX === 0 && Math.abs(e.deltaY) >= 50;
      if (e.ctrlKey || wheel)
        zoomRef.current(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
      else panRef.current(-e.deltaX, -e.deltaY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const hovered = useRef<SpaceId | null>(null);
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; mx: number; my: number; view: View } | null>(null);
  const spread = () => {
    const [a, b] = [...touches.current.values()];
    return { dist: Math.hypot(a!.x - b!.x, a!.y - b!.y), mx: (a!.x + b!.x) / 2, my: (a!.y + b!.y) / 2 };
  };
  const lift = (e: ReactPointerEvent) => {
    touches.current.delete(e.pointerId);
    if (touches.current.size < 2) pinch.current = null;
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.pointerType === 'touch') {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.current.size === 2) {
        const r = box.current!.getBoundingClientRect();
        const { dist, mx, my } = spread();
        pinch.current = { dist, mx: mx - r.left, my: my - r.top, view: v };
        drag.current = null;
        return;
      }
    }
    if (e.button !== 0) return;
    const p = pieceOf(e.target) ?? pieceNear(e.clientX, e.clientY);
    if (p && onPieceDown(p.space, p.stack, e.clientX, e.clientY, e.shiftKey)) {
      drag.current = null;
      return;
    }
    drag.current = { x: e.clientX, y: e.clientY, tx: v.tx, ty: v.ty, moved: false };
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (touches.current.has(e.pointerId)) touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = pinch.current;
    if (p && touches.current.size === 2) {
      const r = box.current!.getBoundingClientRect();
      const { dist, mx, my } = spread();
      const k = normalize({ ...p.view, k: (p.view.k * dist) / p.dist }, size.w, size.h).k;
      const f = k / p.view.k;
      setView(
        normalize({ tx: mx - r.left - (p.mx - p.view.tx) * f, ty: my - r.top - (p.my - p.view.ty) * f, k }, size.w, size.h),
      );
      return;
    }
    const d = drag.current;
    if (!d || (e.buttons & 1) === 0) {
      const id = (e.target as Element).closest('[data-space]')?.getAttribute('data-space') ?? null;
      if (id !== hovered.current) onHover((hovered.current = id));
      return;
    }
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_SLOP) return;
    if (!d.moved) {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      if (hovered.current !== null) onHover((hovered.current = null));
    }
    d.moved = true;
    setView(normalize({ tx: d.tx + dx, ty: d.ty + dy, k: v.k }, size.w, size.h));
  };
  const onClick = (e: ReactMouseEvent) => {
    const moved = drag.current?.moved ?? false;
    drag.current = null;
    if (moved) return;
    const p = pieceOf(e.target);
    if (p) return onPiece({ ...p, all: e.shiftKey || e.detail === 2, putBack: e.altKey });
    const hit = (e.target as Element).closest('[data-space]');
    const id = hit?.getAttribute('data-space');
    if (id) onSpace(id);
    else onBackground();
  };

  const onContextMenu = (e: ReactMouseEvent) => {
    const p = pieceOf(e.target);
    if (!p) return;
    e.preventDefault();
    onPiece({ ...p, all: e.shiftKey, putBack: true });
  };
  const onLeave = () => {
    if (hovered.current !== null) onHover((hovered.current = null));
  };

  const captured = useCaptured(world.state.owner);
  const content = <World {...world} captured={captured} />;
  return (
    <div
      ref={box}
      className="map"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerLeave={onLeave}
      onPointerUp={lift}
      onPointerCancel={lift}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <svg width={size.w} height={size.h}>
        <defs>
          <NeutralPattern />
          <TrailHead />
        </defs>
        <rect width={size.w} height={size.h} className="ocean" />
        <g transform={`translate(${v.tx},${v.ty}) scale(${v.k})`}>
          {[0, MAP_WIDTH, 2 * MAP_WIDTH].map((dx) => (
            <g key={dx} transform={`translate(${dx},0)`}>
              {content}
            </g>
          ))}
        </g>
      </svg>
      <div className="zoom-buttons" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
        <button onClick={() => zoomAt(1.3, size.w / 2, size.h / 2)}>+</button>
        <button onClick={() => zoomAt(1 / 1.3, size.w / 2, size.h / 2)}>−</button>
      </div>
    </div>
  );
}
