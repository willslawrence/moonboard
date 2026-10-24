// Will's Wall's service worker: only for the alerts (store/push.js): connects on the MoonBoard, logs on the Sun board. It keeps no copy of
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
  }).then(badge));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  badge();
  const url = new URL((e.notification.data && e.notification.data.url) || '/', location.origin).href;
  const path = new URL(url).pathname;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    // the Sun board's alerts open the Sun page, the MoonBoard's the MoonBoard's
    const same = list.find(c => new URL(c.url).pathname === path);
    return same ? same.focus() : self.clients.openWindow(url);
  }));
});

// The red number on the app's icon: how many of its notifications are still waiting. Opening the app clears it.
function badge() {
  return self.registration.getNotifications()
    .then(list => (self.navigator.setAppBadge ? self.navigator.setAppBadge(list.length) : null))
    .catch(() => {});
}
