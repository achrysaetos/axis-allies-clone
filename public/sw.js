// Shows the server's "your move" pushes while no tab of the game is open. The payload is a PushPayload from src/net/protocol.ts.

self.addEventListener('push', (event) => {
  const { title, body, url } = event.data.json();
  event.waitUntil(self.registration.showNotification(title, { body, tag: url, data: { url } }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data.url, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((tabs) => {
      const tab = tabs.find((t) => t.url === url);
      return tab ? tab.focus() : self.clients.openWindow(url);
    }),
  );
});
