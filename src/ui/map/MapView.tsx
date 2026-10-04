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

interface Props extends WorldProps {
  onSpace: (id: SpaceId) => void;
  onBackground: () => void;
  /** Changing this value recenters the map on the space. */
  focus: { id: SpaceId; nonce: number } | null;
}

const MAX_ZOOM = 4;
const DRAG_SLOP = 4;

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

export function MapView({ state, selected, highlights, onSpace, onBackground, focus }: Props) {
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
    setView((v) => centeredOn(focus.id, v?.k ?? 0.9, size.w, size.h));
  }, [focus, size.w, size.h]);

  const v = normalize(view ?? centeredOn('Germany', 0.9, size.w, size.h), size.w, size.h);

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

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, tx: v.tx, ty: v.ty, moved: false };
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || (e.buttons & 1) === 0) return;
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
    const hit = (e.target as Element).closest('[data-space]');
    const id = hit?.getAttribute('data-space');
    if (id) onSpace(id);
    else onBackground();
  };

  const world = <World state={state} selected={selected} highlights={highlights} />;
  return (
    <div ref={box} className="map" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onClick={onClick}>
      <svg width={size.w} height={size.h}>
        <defs>
          <NeutralPattern />
        </defs>
        <rect width={size.w} height={size.h} className="ocean" />
        <g transform={`translate(${v.tx},${v.ty}) scale(${v.k})`}>
          {[0, MAP_WIDTH, 2 * MAP_WIDTH].map((dx) => (
            <g key={dx} transform={`translate(${dx},0)`}>
              {world}
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
