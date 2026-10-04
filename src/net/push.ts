import { useCallback, useEffect, useState } from 'react';
import type { RoomConnection } from './client';
import type { PushKeyResponse, PushSubscriptionKeys } from './protocol';

/** `blocked` means the browser's site settings deny notifications; only the player can change that. */
export type Bell = 'on' | 'off' | 'blocked';

const OFF_KEY = 'aa1942.push.off';
const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function loadOff(): boolean {
  try {
    return localStorage.getItem(OFF_KEY) === '1';
  } catch {
    return false;
  }
}

function saveOff(off: boolean): void {
  try {
    if (off) localStorage.setItem(OFF_KEY, '1');
    else localStorage.removeItem(OFF_KEY);
  } catch {
    // The bell then resets on the next visit.
  }
}

const unpadded = (s: string | undefined) => (s ?? '').replace(/=+$/, '');

function sameKey(a: ArrayBuffer | null, key: string): boolean {
  const b64 = a && btoa(String.fromCharCode(...new Uint8Array(a)));
  return b64?.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') === key;
}

async function subscribe(key: string): Promise<PushSubscriptionKeys> {
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub.options.applicationServerKey, key)) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const json = sub.toJSON();
  return { endpoint: sub.endpoint, keys: { p256dh: unpadded(json.keys?.p256dh), auth: unpadded(json.keys?.auth) } };
}

/**
 * Keeps this browser subscribed to pushes for the room while the player wants them.
 * `bell` is null where push cannot work: an unsupported browser, or a server without keys.
 */
export function usePush(me: RoomConnection['me'], send: RoomConnection['send']) {
  const [key, setKey] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    'Notification' in window ? Notification.permission : 'denied',
  );
  const [off, setOff] = useState(loadOff);
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    if (!supported()) return;
    let live = true;
    fetch('/api/push-key')
      .then((r) => r.json() as Promise<PushKeyResponse>)
      .then(async ({ key }) => {
        if (!key || !live) return;
        await navigator.serviceWorker.register('/sw.js');
        if (live) setKey(key);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!key || !me || off || permission !== 'granted') return;
    let live = true;
    subscribe(key).then(
      (subscription) => {
        if (!live) return;
        send({ t: 'subscribe', subscription });
        setSubscribed(true);
      },
      () => live && setSubscribed(false),
    );
    return () => {
      live = false;
    };
  }, [key, me, off, permission, send]);

  /** Asks the browser for permission if it has not been asked yet; the tab's own alerts need it even without push. */
  const enable = useCallback(async () => {
    saveOff(false);
    setOff(false);
    if ('Notification' in window && Notification.permission === 'default') setPermission(await Notification.requestPermission());
  }, []);

  const disable = useCallback(async () => {
    saveOff(true);
    setOff(true);
    setSubscribed(false);
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    await sub?.unsubscribe();
  }, []);

  const bell: Bell | null = !key ? null : permission === 'denied' ? 'blocked' : subscribed ? 'on' : 'off';
  return { bell, enable, disable };
}
