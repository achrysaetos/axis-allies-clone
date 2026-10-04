import { parseSession, serialize } from './session';
import type { Session } from './session';

const SAVE_KEY = 'aa1942.session.v1';

export function loadAutosave(): Session | null {
  try {
    const text = localStorage.getItem(SAVE_KEY);
    if (!text) return null;
    const s = parseSession(text);
    return typeof s === 'string' ? null : s;
  } catch {
    return null;
  }
}

export function autosave(session: Session): void {
  try {
    localStorage.setItem(SAVE_KEY, serialize(session));
  } catch {
    // Storage can be full or blocked; the game keeps running and export still works.
  }
}

export function downloadSave(session: Session): void {
  const blob = new Blob([serialize(session)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `aa1942-round${session.state.round}-${session.state.power}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
