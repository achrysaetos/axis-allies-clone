import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react';
import type { SpaceId } from '../../engine/types';
import { CENTER, MAP_HEIGHT, MAP_WIDTH } from './geometry';
import { NeutralPattern, World } from './World';
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

interface Props extends WorldProps {
  onSpace: (id: SpaceId) => void;
  onPiece: (e: PieceEvent) => void;
  /** A press on a piece; returning true means the piece can be dragged, so the map does not pan. */
  onPieceDown: (space: SpaceId, stack: string, x: number, y: number) => boolean;
  onHover: (id: SpaceId | null) => void;
  onBackground: () => void;
  /** Changing this value recenters the map on the space. */
  focus: { id: SpaceId; nonce: number } | null;
  /** Spaces the player now needs to see; the map pans to the nearest one only if none is on screen. */
  reveal: readonly SpaceId[];
}

const MAX_ZOOM = 4;
const DRAG_SLOP = 4;
const START_ZOOM = 1.35;

function normalize(v: View, w: number, h: number): View {
  const minK = Math.max(w / MAP_WIDTH, h / MAP_HEIGHT, 0.05);
  const k = Math.min(MAX_ZOOM, Math.max(minK, v.k));
  const span = MAP_WIDTH * k;
  const tx = (((v.tx % span) + span) % span) - span;
  const ty = Math.min(0, Math.max(h - MAP_HEIGHT * k, v.ty));
  return { tx, ty, k };
}

function centeredOn(id: SpaceId, k: number, w: number, h: number): View {
  const [x, y] = CENTER.get(id) ?? [MAP_WIDTH / 2, MAP_HEIGHT / 2];
  return normalize({ tx: w / 2 - x * k, ty: h / 2 - y * k, k }, w, h);
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
    setView((v) => centeredOn(focus.id, v?.k ?? START_ZOOM, size.w, size.h));
  }, [focus, size.w, size.h]);

  const revealKey = reveal.join('|');
  useEffect(() => {
    if (reveal.length === 0) return;
    setView((cur) => {
      const base = normalize(cur ?? centeredOn('Germany', START_ZOOM, size.w, size.h), size.w, size.h);
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

  const v = normalize(view ?? centeredOn('Germany', START_ZOOM, size.w, size.h), size.w, size.h);

  const zoomAt = (factor: number, px: number, py: number) =>
    setView((cur) => {
      const base = normalize(cur ?? v, size.w, size.h);
      const k = normalize({ ...base, k: base.k * factor }, size.w, size.h).k;
      const f = k / base.k;
      return normalize({ tx: px - (px - base.tx) * f, ty: py - (py - base.ty) * f, k }, size.w, size.h);
    });
  const zoomRef = useRef(zoomAt);
  zoomRef.current = zoomAt;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomRef.current(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const hovered = useRef<SpaceId | null>(null);
  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    const p = pieceOf(e.target);
    if (p && onPieceDown(p.space, p.stack, e.clientX, e.clientY)) {
      drag.current = null;
      return;
    }
    drag.current = { x: e.clientX, y: e.clientY, tx: v.tx, ty: v.ty, moved: false };
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || (e.buttons & 1) === 0) {
      const id = (e.target as Element).closest('[data-space]')?.getAttribute('data-space') ?? null;
      if (id !== hovered.current) onHover((hovered.current = id));
      return;
    }
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_SLOP) return;
    if (!d.moved) (e.currentTarget as Element).setPointerCapture(e.pointerId);
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

  const content = <World {...world} />;
  return (
    <div
      ref={box}
      className="map"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerLeave={onLeave}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <svg width={size.w} height={size.h}>
        <defs>
          <NeutralPattern />
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
