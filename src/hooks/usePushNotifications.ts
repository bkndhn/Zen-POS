import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

/**
 * Unified Push Notifications hook.
 *
 * Architecture:
 *  ┌────────────────┐     ┌────────────────────┐
 *  │  Capacitor App │     │  Web Browser (PWA)  │
 *  │ (Android/iOS)  │     │ (Chrome/Edge/FF)    │
 *  └───────┬────────┘     └───────┬─────────────┘
 *          │                      │
 *    Capacitor FCM          Firebase Web SDK
 *    Plugin (native)        + Service Worker
 *          │                      │
 *          └────────┬─────────────┘
 *                   │
 *          ┌────────▼────────┐
 *          │  user_devices   │
 *          │  (Supabase DB)  │
 *          │ user_id, token, │
 *          │ platform        │
 *          └────────┬────────┘
 *                   │
 *          ┌────────▼────────┐
 *          │  send-push      │
 *          │  Edge Function  │
 *          │ (Firebase Admin) │
 *          └─────────────────┘
 *
 * Both native and web tokens are stored in the same user_devices table.
 * The send-push edge function handles both transparently via Firebase Admin SDK.
 * Super admin permission gate (fcm_unlocked) applies to BOTH platforms.
 */
export const usePushNotifications = () => {
  const { user } = useAuth();
  const webUnsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!user) return;

    let cleanup = false;

    if (Capacitor.isNativePlatform()) {
      // ─── NATIVE (Capacitor) PATH ───────────────────────────────
      initNative(user.id, () => cleanup).catch((e) =>
        console.warn('[FCM Native] Init failed:', e)
      );
    } else {
      // ─── WEB BROWSER PATH ─────────────────────────────────────
      initWeb(user.id, () => cleanup, webUnsubscribeRef).catch((e) =>
        console.warn('[FCM Web] Init failed:', e)
      );
    }

    return () => {
      cleanup = true;

      // Cleanup native listeners
      if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('PushNotifications')) {
        import('@capacitor/push-notifications')
          .then(({ PushNotifications }) =>
            Promise.resolve(PushNotifications.removeAllListeners()).catch(() => {})
          )
          .catch(() => {});
      }

      // Cleanup web foreground listener
      if (webUnsubscribeRef.current) {
        webUnsubscribeRef.current();
        webUnsubscribeRef.current = null;
      }
    };
  }, [user]);
};

// ═══════════════════════════════════════════════════════════════
//  NATIVE (Capacitor) — Android / iOS
// ═══════════════════════════════════════════════════════════════

async function initNative(userId: string, isCleanedUp: () => boolean) {
  if (!Capacitor.isPluginAvailable('PushNotifications')) {
    console.warn('[FCM Native] PushNotifications plugin not available.');
    return;
  }

  const { PushNotifications } = await import('@capacitor/push-notifications');

  // Check & request permissions
  const permStatus = await PushNotifications.checkPermissions();
  if (permStatus.receive === 'prompt') {
    const newStatus = await PushNotifications.requestPermissions();
    if (newStatus.receive !== 'granted') return;
  } else if (permStatus.receive !== 'granted') {
    return;
  }

  // Create high-priority Android channel
  if (Capacitor.getPlatform() === 'android') {
    await PushNotifications.createChannel({
      id: 'zenpos_default',
      name: 'ZenPOS Notifications',
      description: 'Order alerts, low stock warnings, and important updates',
      importance: 5,
      visibility: 1,
      vibration: true,
      sound: 'default',
      lights: true,
    });
  }

  // Token registration → save to Supabase
  await PushNotifications.addListener('registration', async (token) => {
    if (isCleanedUp()) return;
    await saveDeviceToken(userId, token.value, Capacitor.getPlatform());
  });

  // Registration error → retry once after 3s
  await PushNotifications.addListener('registrationError', (error: any) => {
    console.error('[FCM Native] Registration error:', JSON.stringify(error));
    setTimeout(() => {
      if (!isCleanedUp()) {
        PushNotifications.register().catch(() => {});
      }
    }, 3000);
  });

  // Foreground notification → show toast
  await PushNotifications.addListener('pushNotificationReceived', (notification) => {
    toast.info(notification.title || 'New Notification', {
      description: notification.body || '',
    });
  });

  // Notification tap → navigate
  await PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
    const url = notification.notification.data?.url;
    if (url) {
      navigateToUrl(url);
    }
  });

  await PushNotifications.register();
}

// ═══════════════════════════════════════════════════════════════
//  WEB BROWSER — Chrome, Edge, Firefox, Safari 16+
// ═══════════════════════════════════════════════════════════════

async function initWeb(
  userId: string,
  isCleanedUp: () => boolean,
  unsubRef: React.MutableRefObject<(() => void) | null>
) {
  // Guard: no service workers = no web push
  if (!('serviceWorker' in navigator) || !('Notification' in window)) {
    console.warn('[FCM Web] Service workers or Notifications API not available.');
    return;
  }

  // Register the Firebase messaging service worker
  try {
    await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
  } catch (swError) {
    console.warn('[FCM Web] Service worker registration failed:', swError);
    return;
  }

  // Dynamic import to avoid bundling Firebase SDK for native builds
  const { getWebPushToken, onForegroundMessage, getMessagingInstance } = await import('@/utils/firebaseWeb');

  // Check if Firebase Messaging is supported
  const messaging = await getMessagingInstance();
  if (!messaging) return;

  // IMPORTANT: Browsers block Notification.requestPermission() if not triggered by a user gesture.
  // If permission is default, we show a toast with an action button so they can click it.
  if (Notification.permission === 'default') {
    toast.info('Enable Web Notifications', {
      description: 'Get alerts for new orders and low stock',
      action: {
        label: 'Allow',
        onClick: async () => {
          const perm = await Notification.requestPermission();
          if (perm === 'granted') {
            toast.success('Notifications enabled!');
            initWeb(userId, isCleanedUp, unsubRef); // Retry init
          }
        }
      },
      duration: 10000,
    });
    return;
  }

  // Get the push token (will request permission if needed, but we already gated it above)
  const token = await getWebPushToken();
  if (!token) return;
  if (isCleanedUp()) return;

  // Save web token to the same user_devices table
  await saveDeviceToken(userId, token, 'web');

  // Listen for foreground messages → show toast
  const unsub = onForegroundMessage((payload: any) => {
    if (isCleanedUp()) return;

    const title = payload.notification?.title || 'ZenPOS Alert';
    const body = payload.notification?.body || '';

    toast.info(title, { description: body });
  });

  if (unsub) {
    unsubRef.current = unsub;
  }

  // Listen for notification click messages from the service worker
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'NOTIFICATION_CLICK' && event.data.url) {
      navigateToUrl(event.data.url);
    }
  });
}

// ═══════════════════════════════════════════════════════════════
//  SHARED UTILITIES
// ═══════════════════════════════════════════════════════════════

/** Save device token to Supabase (upsert by user_id + device_token). */
async function saveDeviceToken(userId: string, token: string, platform: string) {
  try {
    const { error } = await supabase.from('user_devices').upsert(
      {
        user_id: userId,
        device_token: token,
        platform,
      },
      { onConflict: 'user_id,device_token' }
    );
    if (error) {
      console.error(`[FCM ${platform}] Failed to save token:`, error);
    } else {
      console.log(`[FCM ${platform}] Token registered successfully.`);
    }
  } catch (e) {
    console.error(`[FCM ${platform}] Exception saving token:`, e);
  }
}

/** Navigate to a URL using SPA-safe routing. */
function navigateToUrl(url: string) {
  if (url.startsWith('/') || url.startsWith(window.location.origin)) {
    const path = url.startsWith('/') ? url : new URL(url).pathname;
    window.dispatchEvent(new CustomEvent('push-navigate', { detail: { path } }));
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  } else {
    window.location.href = url;
  }
}
