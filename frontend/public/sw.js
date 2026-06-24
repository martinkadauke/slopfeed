// slopfeed service worker — handles Web Push display + notification clicks.
// (Caching/offline is intentionally minimal for now.)
self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'slopfeed', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'slopfeed';
  const options = {
    body: data.body || '',
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: data.tag || undefined,
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if ('focus' in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return clients.openWindow(url);
    }),
  );
});
