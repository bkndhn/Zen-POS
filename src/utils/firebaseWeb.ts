/**
 * Firebase Web SDK wrapper for FCM Web Push.
 *
 * Design goals:
 *  - Never throw. Every failure returns an explicit, human-explainable status code.
 *  - Never silently swallow an error (the previous version did — that is why web push
 *    "looked" broken even with browser permission granted).
 *  - Same Firebase project as the Capacitor app so one server path serves both.
 */
import { initializeApp, getApps } from 'firebase/app';
import {
  getMessaging,
  getToken,
  deleteToken,
  onMessage,
  isSupported,
  type Messaging,
} from 'firebase/messaging';

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyCUQW2tLm6Jh0Ib0IJ-uBZY1RpFOW2joSE',
  authDomain: `${import.meta.env.VITE_FIREBASE_PROJECT_ID || 'tamilnews-63848'}.firebaseapp.com`,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'tamilnews-63848',
  storageBucket: `${import.meta.env.VITE_FIREBASE_PROJECT_ID || 'tamilnews-63848'}.appspot.com`,
  messagingSenderId: import.meta.env.VITE_FIREBASE_SENDER_ID || '650662888105',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:650662888105:web:a4387bcce9ebf7e62d1fb8',
};

export const VAPID_KEY =
  import.meta.env.VITE_FIREBASE_VAPID_KEY ||
  'BM8N4kX1uE1vTI4IJE4F8GTaAy2o4uzz-loI_1m615_PWnR7pKI0U5-yamDl5uCXdLjrkTzKXFfo3XvkeNRjUUc';

/** Every terminal outcome of a web-push enable attempt. */
export type WebPushStatus =
  | 'registered'      // token acquired + ready
  | 'unsupported'     // browser can't do FCM web push (iOS Safari < 16.4, in-app browsers…)
  | 'insecure'        // not https / not localhost
  | 'iframe'          // running inside the Lovable preview iframe → prompt is blocked
  | 'permission-needed' // permission is "default"; needs a user click
  | 'denied'          // user (or browser policy) blocked notifications
  | 'sw-failed'       // service worker could not be registered
  | 'no-token'        // FCM returned an empty token
  | 'error';          // anything else — `error` holds the exact Firebase code

export interface WebPushResult {
  status: WebPushStatus;
  token?: string;
  error?: string;
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
let messagingInstance: Messaging | null = null;
let swRegistration: ServiceWorkerRegistration | null = null;

export const isInIframe = (): boolean => {
  try {
    return window.top !== window.self;
  } catch {
    return true;
  }
};

const isSecure = (): boolean =>
  window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1';

export const getMessagingInstance = async (): Promise<Messaging | null> => {
  if (messagingInstance) return messagingInstance;
  try {
    if (!(await isSupported())) return null;
    messagingInstance = getMessaging(app);
    return messagingInstance;
  } catch (e) {
    console.warn('[FCM Web] getMessaging failed:', e);
    return null;
  }
};

/** Register (or reuse) the Firebase messaging service worker at root scope. */
export const ensureServiceWorker = async (): Promise<ServiceWorkerRegistration | null> => {
  if (swRegistration) return swRegistration;
  if (!('serviceWorker' in navigator)) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
    swRegistration =
      existing ??
      (await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' }));
    // Make sure it is actually active before asking FCM to use it.
    await navigator.serviceWorker.ready;
    return swRegistration;
  } catch (e) {
    console.error('[FCM Web] Service worker registration failed:', e);
    return null;
  }
};

/**
 * Attempt to enable web push.
 * @param interactive true when called from a real user gesture (allows the permission prompt).
 */
export const enableWebPush = async (interactive: boolean): Promise<WebPushResult> => {
  if (typeof window === 'undefined') return { status: 'unsupported' };
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    return { status: 'unsupported' };
  }
  if (!isSecure()) return { status: 'insecure' };
  if (!(await isSupported())) return { status: 'unsupported' };
  if (!VAPID_KEY) return { status: 'error', error: 'VAPID key not configured' };

  let permission = Notification.permission;

  if (permission === 'denied') return { status: 'denied' };

  if (permission === 'default') {
    // Cross-origin iframes (the Lovable preview) silently reject the prompt.
    if (isInIframe()) return { status: 'iframe' };
    if (!interactive) return { status: 'permission-needed' };
    try {
      permission = await Notification.requestPermission();
    } catch (e: any) {
      return { status: 'error', error: e?.message || 'requestPermission failed' };
    }
    if (permission !== 'granted') return { status: 'denied' };
  }

  const registration = await ensureServiceWorker();
  if (!registration) return { status: 'sw-failed' };

  const messaging = await getMessagingInstance();
  if (!messaging) return { status: 'unsupported' };

  try {
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (!token) return { status: 'no-token' };
    return { status: 'registered', token };
  } catch (e: any) {
    const code = e?.code || e?.name || '';
    const message = e?.message || String(e);
    console.error('[FCM Web] getToken failed:', code, message);
    if (String(code).includes('permission-blocked') || String(message).includes('permission')) {
      return { status: 'denied', error: `${code} ${message}`.trim() };
    }
    return { status: 'error', error: `${code} ${message}`.trim() };
  }
};

/** Remove the current browser token from FCM (used on sign-out / disable). */
export const revokeWebPushToken = async (): Promise<void> => {
  try {
    const messaging = await getMessagingInstance();
    if (messaging) await deleteToken(messaging);
  } catch {
    /* best effort */
  }
};

export const onForegroundMessage = (cb: (payload: any) => void): (() => void) | null => {
  if (!messagingInstance) return null;
  try {
    return onMessage(messagingInstance, cb);
  } catch {
    return null;
  }
};

/** Human-readable explanation for each status — shared by toasts and the settings UI. */
export const describeWebPushStatus = (status: WebPushStatus, error?: string): string => {
  switch (status) {
    case 'registered':
      return 'This device is registered for push notifications.';
    case 'permission-needed':
      return 'Tap "Enable on this device" and allow notifications when the browser asks.';
    case 'iframe':
      return 'Open the app in its own browser tab (or install the PWA) — preview windows cannot ask for notification permission.';
    case 'denied':
      return 'Notifications are blocked for this site. Enable them in the browser site settings (lock icon → Notifications → Allow), then try again.';
    case 'unsupported':
      return 'This browser does not support web push. Use Chrome/Edge on Android or desktop, or iOS 16.4+ with the app added to the Home Screen.';
    case 'insecure':
      return 'Web push requires a secure (HTTPS) connection.';
    case 'sw-failed':
      return 'The notification service worker could not start. Reload the page and try again.';
    case 'no-token':
      return 'The browser did not return a push token. Check that the site is not in private/incognito mode.';
    default:
      return `Push registration failed${error ? `: ${error}` : '.'}`;
  }
};

export { app as firebaseApp };
