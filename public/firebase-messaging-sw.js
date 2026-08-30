/**
 * Firebase Cloud Messaging Service Worker
 *
 * This service worker handles push notifications when the web app is in the
 * background or closed. It MUST be at the root of the domain (public/).
 *
 * Firebase SDK version must match the one installed in package.json.
 */
/* eslint-disable no-restricted-globals */
/* eslint-disable no-undef */

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyC7iBPg-_1zF3kevK-KboP1vof6rGDrClA',
  authDomain: 'tamilnews-63848.firebaseapp.com',
  projectId: 'tamilnews-63848',
  storageBucket: 'tamilnews-63848.appspot.com',
  messagingSenderId: '650662888105',
  appId: '1:650662888105:web:a4387bcce9ebf7e62d1fb8',
});

const messaging = firebase.messaging();

// Handle background messages (when the web app is not in focus)
messaging.onBackgroundMessage((payload) => {
  console.log('[FCM SW] Background message received:', payload);

  const title = payload.notification?.title || 'ZenPOS Alert';
  const body = payload.notification?.body || 'You have a new notification.';
  const icon = '/logo.png'; // ZenPOS logo
  const data = payload.data || {};

  // Show the notification
  self.registration.showNotification(title, {
    body,
    icon,
    badge: icon,
    tag: `zenpos-${Date.now()}`,
    data: { url: data.url || '/', ...data },
    vibrate: [200, 100, 200],
    requireInteraction: true,
  });
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('[FCM SW] Notification click:', event.notification.data);
  event.notification.close();

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If the app is already open, focus it and navigate
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          client.postMessage({
            type: 'NOTIFICATION_CLICK',
            url,
          });
          return;
        }
      }
      // Otherwise open a new window
      return clients.openWindow(url);
    })
  );
});
