import { useEffect } from 'react';

export function ConfirmEnd({
  warnings,
  onConfirm,
  onCancel,
}: {
  warnings: string[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') onConfirm();
      else if (e.key === 'Escape') onCancel();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onConfirm, onCancel]);

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="turn-card confirm" onClick={(e) => e.stopPropagation()}>
        <h3>Before you end this phase</h3>
        <ul>
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
        <div className="row actions">
          <button onClick={onCancel}>Go back</button>
          <span className="grow" />
          <button className="primary" onClick={onConfirm} autoFocus>
            End anyway
          </button>
        </div>
      </div>
    </div>
  );
}
