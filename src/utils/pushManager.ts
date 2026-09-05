/**
 * ZenPOS unified Push Notification manager (Capacitor native + Web FCM).
 *
 *  Super Admin  ──unlocks──▶ shop_settings.fcm_unlocked
 *  Shop Owner   ──enables──▶ shop_settings.fcm_enabled
 *                     │
 *                     ▼  get_push_gate()  (one permission covers BOTH platforms,
 *                     │                    inherited by every sub-user of the admin)
 *          ┌──────────┴───────────┐
 *   Capacitor (Android/iOS)     Web browser / PWA
 *   @capacitor/push-notif       firebase/messaging + /firebase-messaging-sw.js
 *          └──────────┬───────────┘
 *                     ▼
 *            register_device_token()  →  public.user_devices
 *                     ▼
*            push_queue → process-push-queue → send-push (FCM HTTP v1)
 *
 * This module is a singleton store: one registration attempt per session, with a
 * subscribable state so any UI (settings page, banners) can show exact status.
 */
import { Capacitor } from '@capacitor/core';
import { requireOnline } from '@/utils/onlineGuard';
import { supabase } from '@/integrations/supabase/client';
import {
  enableWebPush,
  onForegroundMessage,
  revokeWebPushToken,
  describeWebPushStatus,
  isInIframe,
  type WebPushStatus,
} from '@/utils/firebaseWeb';
import { toast } from 'sonner';

export type PushStatus =
  | 'idle'
  | 'checking'
  | 'locked'        // super admin has not unlocked the add-on
  | 'disabled'      // owner switched push off in settings
  | 'registered'
  | WebPushStatus;

export interface PushState {
  status: PushStatus;
  platform: 'web' | 'android' | 'ios';
  gate: { unlocked: boolean; enabled: boolean } | null;
  token: string | null;
  error: string | null;
  busy: boolean;
}

const state: PushState = {
  status: 'idle',
  platform: (Capacitor.getPlatform() as PushState['platform']) || 'web',
  gate: null,
  token: null,
  error: null,
  busy: false,
};

type Listener = () => void;
const listeners = new Set<Listener>();
let snapshot: PushState = { ...state };

const emit = (patch: Partial<PushState>) => {
  Object.assign(state, patch);
  snapshot = { ...state };
  listeners.forEach((l) => l());
};

export const subscribePush = (l: Listener) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const getPushSnapshot = () => snapshot;

let currentUserId: string | null = null;
let initPromise: Promise<void> | null = null;
let foregroundUnsub: (() => void) | null = null;
let nativeListenersBound = false;

// ── helpers ────────────────────────────────────────────────────────────────

async function fetchGate(): Promise<{ unlocked: boolean; enabled: boolean }> {
  try {
    const { data, error } = await supabase.rpc('get_push_gate');
    if (error) throw error;
    const row: any = Array.isArray(data) ? data[0] : data;
    return { unlocked: !!row?.unlocked, enabled: !!row?.enabled };
  } catch (e) {
    console.warn('[Push] Gate lookup failed:', e);
    return { unlocked: false, enabled: false };
  }
}

async function saveToken(token: string, platform: string) {
  const { error } = await supabase.rpc('register_device_token', {
    p_token: token,
    p_platform: platform,
    p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
  });
  if (error) {
    console.error('[Push] Failed to store device token:', error);
    throw new Error(error.message);
  }
  console.log(`[Push] Device token registered (${platform}).`);
}

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

// ── native (Capacitor) ─────────────────────────────────────────────────────

async function registerNative(interactive: boolean): Promise<void> {
  if (!Capacitor.isPluginAvailable('PushNotifications')) {
    emit({ status: 'unsupported', error: 'PushNotifications plugin unavailable' });
    return;
  }
  const { PushNotifications } = await import('@capacitor/push-notifications');

  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
    if (!interactive) {
      // Native prompts are allowed on first launch — request straight away.
      perm = await PushNotifications.requestPermissions();
    } else {
      perm = await PushNotifications.requestPermissions();
    }
  }
  if (perm.receive !== 'granted') {
    emit({ status: 'denied' });
    return;
  }

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
    }).catch(() => {});
  }

  if (!nativeListenersBound) {
    nativeListenersBound = true;

    await PushNotifications.addListener('registration', async (token) => {
      try {
        await saveToken(token.value, Capacitor.getPlatform());
        emit({ status: 'registered', token: token.value, error: null });
      } catch (e: any) {
        emit({ status: 'error', error: e?.message || 'Token save failed' });
      }
    });

    await PushNotifications.addListener('registrationError', (error: any) => {
      const msg = typeof error === 'string' ? error : JSON.stringify(error);
      console.error('[Push Native] Registration error:', msg);
      emit({ status: 'error', error: msg });
      setTimeout(() => PushNotifications.register().catch(() => {}), 3000);
    });

    await PushNotifications.addListener('pushNotificationReceived', (n) => {
      toast.info(n.title || 'ZenPOS Alert', { description: n.body || '' });
    });

    await PushNotifications.addListener('pushNotificationActionPerformed', (n) => {
      const url = (n.notification.data as any)?.url;
      if (url) navigateToUrl(url);
    });
  }

  await PushNotifications.register();
}

// ── web ────────────────────────────────────────────────────────────────────

async function registerWeb(interactive: boolean): Promise<void> {
  const result = await enableWebPush(interactive);

  if (result.status !== 'registered' || !result.token) {
    emit({ status: result.status, error: result.error || null, token: null });
    if (result.status !== 'registered') {
      console.warn('[Push Web]', result.status, describeWebPushStatus(result.status, result.error));
    }
    return;
  }

  try {
    await saveToken(result.token, 'web');
  } catch (e: any) {
    emit({ status: 'error', error: e?.message || 'Token save failed' });
    return;
  }

  emit({ status: 'registered', token: result.token, error: null });

  if (!foregroundUnsub) {
    foregroundUnsub = onForegroundMessage((payload: any) => {
      const title = payload?.notification?.title || payload?.data?.title || 'ZenPOS Alert';
      const body = payload?.notification?.body || payload?.data?.body || '';
      toast.info(title, { description: body });
    });

    navigator.serviceWorker?.addEventListener('message', (event: MessageEvent) => {
      if (event.data?.type === 'NOTIFICATION_CLICK' && event.data.url) {
        navigateToUrl(event.data.url);
      }
    });
  }
}

// ── public API ─────────────────────────────────────────────────────────────

/** Silent bootstrap on login. Never prompts on the web (browsers require a gesture). */
export async function initPush(userId: string): Promise<void> {
  if (currentUserId === userId && initPromise) return initPromise;
  currentUserId = userId;

  initPromise = (async () => {
    emit({ status: 'checking', busy: true, error: null });
    const gate = await fetchGate();
    emit({ gate });

    if (!gate.unlocked) {
      emit({ status: 'locked', busy: false });
      return;
    }
    if (!gate.enabled) {
      emit({ status: 'disabled', busy: false });
      return;
    }

    try {
      if (Capacitor.isNativePlatform()) {
        await registerNative(false);
      } else {
        await registerWeb(false);
      }
    } catch (e: any) {
      emit({ status: 'error', error: e?.message || String(e) });
    } finally {
      emit({ busy: false });
    }
  })();

  return initPromise;
}

/** Called from a real user click — this is the only path allowed to prompt on the web. */
export async function enablePushInteractive(): Promise<PushState> {
  emit({ busy: true, error: null });
  try {
    const gate = await fetchGate();
    emit({ gate });
    if (!gate.unlocked) {
      emit({ status: 'locked' });
      return snapshot;
    }
    if (!gate.enabled) {
      emit({ status: 'disabled' });
      return snapshot;
    }
    if (Capacitor.isNativePlatform()) {
      await registerNative(true);
    } else {
      await registerWeb(true);
    }
  } catch (e: any) {
    emit({ status: 'error', error: e?.message || String(e) });
  } finally {
    emit({ busy: false });
  }
  return snapshot;
}

/** Send a push to the signed-in user through the real server path (end-to-end proof). */
export async function sendTestPush(): Promise<{ ok: boolean; message: string }> {
  try {
    const { data: sessionData } = await supabase.auth.getUser();
    const userId = sessionData.user?.id;
    if (!userId) return { ok: false, message: 'Not signed in.' };

    requireOnline('Sending a notification');
    const { data, error } = await supabase.functions.invoke('send-push', {
      body: {
        user_id: userId,
        title: '🔔 ZenPOS test notification',
        body: 'Push notifications are working on this device.',
        data: { url: '/settings' },
      },
    });
    if (error) {
      const details =
        (error as any)?.context?.text ? await (error as any).context.text() : error.message;
      return { ok: false, message: details || 'Edge function error' };
    }
    const sent = (data as any)?.successCount ?? 0;
    const failed = (data as any)?.failureCount ?? 0;
    if (sent === 0) {
      return {
        ok: false,
        message:
          (data as any)?.message ||
          `No notification delivered (failures: ${failed}). Re-register this device and retry.`,
      };
    }
    return { ok: true, message: `Sent to ${sent} device${sent > 1 ? 's' : ''}.` };
  } catch (e: any) {
    return { ok: false, message: e?.message || String(e) };
  }
}

/** Remove this browser/device from the push list (also used on sign-out). */
export async function disablePushOnThisDevice(): Promise<void> {
  const token = state.token;
  try {
    if (token) await supabase.rpc('unregister_device_token', { p_token: token });
    if (!Capacitor.isNativePlatform()) await revokeWebPushToken();
  } catch (e) {
    console.warn('[Push] Failed to unregister device:', e);
  }
  emit({ status: 'permission-needed', token: null });
}

export function teardownPush() {
  currentUserId = null;
  initPromise = null;
  if (foregroundUnsub) {
    foregroundUnsub();
    foregroundUnsub = null;
  }
  emit({ status: 'idle', token: null, gate: null, error: null, busy: false });
}

export { describeWebPushStatus, isInIframe };
