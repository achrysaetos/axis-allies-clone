import { useCallback, useEffect, useRef, useState } from 'react';
import type { SpaceId } from '../engine/types';

const SLOP = 5;

export const spaceAtPoint = (x: number, y: number): SpaceId | null =>
  document.elementFromPoint(x, y)?.closest('[data-space]')?.getAttribute('data-space') ?? null;

/** Swallow the click a browser fires after a drag ends, so a drop is never also read as a click. */
function swallowNextClick() {
  const stop = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };
  window.addEventListener('click', stop, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0);
}

/**
 * Drag a piece from anywhere (the board or a tray) onto a space. `begin` arms on pointer down; the drag only
 * starts once the pointer travels a few pixels, so a press without movement stays an ordinary click.
 */
export function useDrag(handlers: {
  onStart: () => boolean;
  onOver: (id: SpaceId | null) => void;
  onDrop: (id: SpaceId | null) => void;
}) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  // `pointer` is the finger or mouse that pressed the piece; a second finger means a pinch, which cancels the drag.
  const armed = useRef<{ x: number; y: number; live: boolean; pointer?: number } | null>(null);
  const h = useRef(handlers);
  h.current = handlers;

  useEffect(() => {
    const down = (e: PointerEvent) => {
      const a = armed.current;
      if (!a) return;
      if (a.pointer === undefined) a.pointer = e.pointerId;
      else if (a.pointer !== e.pointerId) cancel();
    };
    const move = (e: PointerEvent) => {
      const a = armed.current;
      if (!a || (a.pointer !== undefined && a.pointer !== e.pointerId)) return;
      if (!a.live) {
        if (Math.hypot(e.clientX - a.x, e.clientY - a.y) < SLOP) return;
        if (!h.current.onStart()) {
          armed.current = null;
          return;
        }
        a.live = true;
      }
      setAt({ x: e.clientX, y: e.clientY });
      h.current.onOver(spaceAtPoint(e.clientX, e.clientY));
    };
    const up = (e: PointerEvent) => {
      const a = armed.current;
      if (a?.pointer !== undefined && a.pointer !== e.pointerId) return;
      armed.current = null;
      if (!a?.live) return;
      setAt(null);
      swallowNextClick();
      h.current.onDrop(spaceAtPoint(e.clientX, e.clientY));
    };
    const cancel = () => {
      if (armed.current?.live) h.current.onDrop(null);
      armed.current = null;
      setAt(null);
    };
    window.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
  }, []);

  const begin = useCallback((x: number, y: number) => {
    armed.current = { x, y, live: false };
  }, []);

  return { begin, at };
}
