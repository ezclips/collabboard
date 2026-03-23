self.addEventListener('push', (event) => {
  let data = { title: 'CollabBoard', body: 'You have a new notification.', url: '/dashboard' };
  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch {
    // Fall back to default payload.
  }

  const title = data.title || 'CollabBoard';
  const options = {
    body: data.body || 'You have a new notification.',
    data: { url: data.url || '/dashboard' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/dashboard';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      const existing = clientsArr.find((client) => client.url.includes(url));
      if (existing) {
        return existing.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
