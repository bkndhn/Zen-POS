/**
 * Firebase Cloud Messaging Service Worker
 *
 * This service worker handles push notifications when the web app is in the
 * background or closed. It MUST be at the root of the domain (public/).
 *
 * Uses BOTH the raw push event listener (most reliable for background/closed apps)
 * AND the Firebase SDK onBackgroundMessage as a fallback.
 */
/* eslint-disable no-restricted-globals */
/* eslint-disable no-undef */

const SITE_URL = 'https://zen-pos.vercel.app';
const ICON_URL = `${SITE_URL}/brand/logo.png`;

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCUQW2tLm6Jh0Ib0IJ-uBZY1RpFOW2joSE',
  authDomain: 'tamilnews-63848.firebaseapp.com',
  projectId: 'tamilnews-63848',
  storageBucket: 'tamilnews-63848.appspot.com',
  messagingSenderId: '650662888105',
  appId: '1:650662888105:web:a4387bcce9ebf7e62d1fb8',
});

const messaging = firebase.messaging();

// ─── RAW PUSH EVENT (Most reliable — fires even when app is completely closed) ───
// This fires for ANY push event. We parse the payload manually.
// The Firebase SDK's onBackgroundMessage only fires for data-only messages,
// so we use this raw handler to guarantee notification display.
// IMPORTANT — exactly one notification per push.
// When the payload carries a `notification` block, the Firebase SDK's own push
// handler already displays it. Showing it again here (or from
// onBackgroundMessage) is what produced duplicate notification cards.
// So this handler only renders DATA-ONLY payloads, and onBackgroundMessage
// never calls showNotification at all.
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch (e) {
    console.warn('[FCM SW] Could not parse push data as JSON:', e);
    return;
  }

  // The SDK handles these; do not render a second copy.
  if (payload.notification || payload.data?.notification) return;

  const title = payload.data?.title || 'ZenPOS Alert';
  const body = payload.data?.body || 'You have a new notification.';
  const url = payload.fcmOptions?.link || payload.data?.url || '/';
  const clickUrl = url.startsWith('http') ? url : `${SITE_URL}${url}`;

  // One visible card per logical event (per bill / per alert type)
  const tag = payload.data?.bill_id
    ? `bill-${payload.data.bill_id}`
    : payload.data?.type
      ? `zenpos-${payload.data.type}`
      : 'zenpos-push';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: ICON_URL,
      badge: ICON_URL,
      tag,
      renotify: false,
      data: { url: clickUrl },
      vibrate: [200, 100, 200],
      requireInteraction: false,
    }),
  );
});

// Kept registered so the SDK owns token lifecycle, but it must never display
// a notification itself — that is the duplicate source.
messaging.onBackgroundMessage(() => {});

// ─── NOTIFICATION CLICK ───
self.addEventListener('notificationclick', (event) => {
  console.log('[FCM SW] Notification click:', event.notification.data);
  event.notification.close();

  const url = event.notification.data?.url || SITE_URL;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(SITE_URL) && 'focus' in client) {
          client.focus();
          client.postMessage({ type: 'NOTIFICATION_CLICK', url });
          return;
        }
      }
      return clients.openWindow(url);
    })
  );
});
