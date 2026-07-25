// Service worker tối thiểu cho PWA: network-first, không cache dữ liệu API
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || e.request.url.includes('/api/')) return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});

// v3.40: thông báo nền. Push gửi RỖNG (không payload) — service worker tự gọi
// /api/notifications lấy tin mới nhất rồi hiện. Nhờ vậy nội dung không đi qua máy chủ
// đẩy của trình duyệt, và server không phải mã hóa payload.
self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let title = 'ERP · CRM';
    let body = 'Bạn có thông báo mới';
    let route = '/dashboard';
    try {
      const response = await fetch('/api/notifications', { cache: 'no-store', credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        const list = Array.isArray(data) ? data : (data.rows || data.notifications || data.items || []);
        const unread = list.filter(n => !n.readAt);
        const latest = unread[0] || list[0];
        if (latest) {
          body = String(latest.text || body).slice(0, 180);
          route = latest.route || route;
          if (unread.length > 1) title = `${unread.length} thông báo mới`;
        }
      }
    } catch { /* mất mạng thì vẫn hiện thông báo mặc định */ }
    await self.registration.showNotification(title, {
      body,
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: 'erp-notification',
      renotify: true,
      data: { route },
    });
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const route = event.notification?.data?.route || '/dashboard';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = all.find(client => 'focus' in client);
    if (existing) { await existing.focus(); if ('navigate' in existing) await existing.navigate(route); return; }
    await self.clients.openWindow(route);
  })());
});
