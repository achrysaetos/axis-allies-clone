import { useEffect, useRef } from 'react';
import { readable } from '../theme';

export function LogPanel({ lines }: { lines: string[] }) {
  const end = useRef<HTMLDivElement>(null);
  const tail = lines.slice(-80);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [lines.length]);
  return (
    <section className="panel log">
      <h3>Log</h3>
      <div className="log-lines">
        {tail.map((l, i) => (
          <div key={lines.length - tail.length + i}>{readable(l)}</div>
        ))}
        <div ref={end} />
      </div>
    </section>
  );
}
