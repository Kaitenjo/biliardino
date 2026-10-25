/*
  The service worker of the push notifications: it shows the notifications sent by the server (a lobby opened, a match
  to play), also with the site closed, and a tap on one opens its page.
*/

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  const notice = event.data ? event.data.json() : {};
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(notice.title || 'CAlcio Balilla', {
        body: notice.body || '',
        icon: '/logo.svg',
        badge: '/logo.svg',
        data: { url: notice.url || '/' }
      }),
      // The open tabs read the lobby again: something changed (a lobby opened, a match was generated)
      self.clients.matchAll({ type: 'window' }).then(windows => windows.forEach(client => client.postMessage({ type: 'push' })))
    ])
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
      // A tab of the site already open: it shows the page, otherwise a new one opens
      const open = windows.find(client => new URL(client.url).origin === self.location.origin);
      if (open) {
        return open.focus().then(client => client.navigate(url)).catch(() => self.clients.openWindow(url));
      }

      return self.clients.openWindow(url);
    })
  );
});
