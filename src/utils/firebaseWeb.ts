/**
 * Firebase Web SDK configuration for FCM Push Notifications.
 *
 * Uses the same Firebase project as the Capacitor app (tamilnews-63848).
 * VAPID key is required for Web Push — generate it from:
 *   Firebase Console → Project Settings → Cloud Messaging → Web Push certificates
 */
import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, onMessage, isSupported, type Messaging } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyC7iBPg-_1zF3kevK-KboP1vof6rGDrClA',
  authDomain: `${import.meta.env.VITE_FIREBASE_PROJECT_ID || 'tamilnews-63848'}.firebaseapp.com`,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'tamilnews-63848',
  storageBucket: `${import.meta.env.VITE_FIREBASE_PROJECT_ID || 'tamilnews-63848'}.appspot.com`,
  messagingSenderId: import.meta.env.VITE_FIREBASE_SENDER_ID || '650662888105',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || 'BM8N4kX1uE1vTI4IJE4F8GTaAy2o4uzz-loI_1m615_PWnR7pKI0U5-yamDl5uCXdLjrkTzKXFfo3XvkeNRjUUc';

// Singleton Firebase app
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

let messagingInstance: Messaging | null = null;

/**
 * Get the Firebase Messaging instance (lazily initialized).
 * Returns null on browsers that don't support push (e.g. Safari < 16, some in-app browsers).
 */
export const getMessagingInstance = async (): Promise<Messaging | null> => {
  if (messagingInstance) return messagingInstance;

  const supported = await isSupported();
  if (!supported) {
    console.warn('[FCM Web] This browser does not support Firebase Cloud Messaging.');
    return null;
  }

  messagingInstance = getMessaging(app);
  return messagingInstance;
};

/**
 * Request notification permission and get the FCM web push token.
 * Returns the token string, or null if permission was denied or not supported.
 */
export const getWebPushToken = async (): Promise<string | null> => {
  try {
    if (!VAPID_KEY) {
      console.warn('[FCM Web] VITE_FIREBASE_VAPID_KEY not configured. Web push disabled.');
      return null;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('[FCM Web] Notification permission denied.');
      return null;
    }

    const messaging = await getMessagingInstance();
    if (!messaging) return null;

    // Wait for service worker to be ready
    const registration = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
    
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration || undefined,
    });

    return token || null;
  } catch (error) {
    console.error('[FCM Web] Failed to get push token:', error);
    return null;
  }
};

/**
 * Listen for foreground push messages.
 * Returns an unsubscribe function.
 */
export const onForegroundMessage = (callback: (payload: any) => void): (() => void) | null => {
  if (!messagingInstance) return null;
  return onMessage(messagingInstance, callback);
};

export { app as firebaseApp };
