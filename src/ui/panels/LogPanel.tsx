import { useEffect, useRef } from 'react';
import { readable } from '../theme';

export function LogPanel({ lines, onClose }: { lines: string[]; onClose: () => void }) {
  const end = useRef<HTMLDivElement>(null);
  const tail = lines.slice(-200);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="turn-card log" onClick={(e) => e.stopPropagation()}>
        <header className="row">
          <h2 className="grow">Game log</h2>
          <button className="link" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="log-lines">
          {tail.map((l, i) => (
            <div key={lines.length - tail.length + i}>{readable(l)}</div>
          ))}
          <div ref={end} />
        </div>
      </div>
    </div>
  );
}
