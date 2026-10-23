// Will's Wall's service worker: only for the connect alerts (store/push.js). It keeps no copy of
// the site and answers no requests, so pages load exactly as they did without it. It is registered
// only on a phone that turns the alerts on in Settings.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let m = {};
  try { m = e.data ? e.data.json() : {}; } catch { m = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(m.title || "Will's Wall", {
    body: m.body || 'Somebody is on the wall.',
    tag: m.tag,
    icon: '/icon-192.png',
    data: { url: m.url || '/' },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/', location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list =>
    list.length ? list[0].focus() : self.clients.openWindow(url)));
});
