import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  initPush,
  teardownPush,
  subscribePush,
  getPushSnapshot,
  enablePushInteractive,
  sendTestPush,
  disablePushOnThisDevice,
  describeWebPushStatus,
  type PushState,
} from '@/utils/pushManager';

/**
 * Unified push hook (Capacitor native + Web FCM).
 * Safe to call from multiple components — the manager underneath is a singleton,
 * so only one registration attempt runs per session.
 */
export const usePushNotifications = () => {
  const { user } = useAuth();

  const state = useSyncExternalStore<PushState>(subscribePush, getPushSnapshot, getPushSnapshot);

  useEffect(() => {
    if (!user) {
      teardownPush();
      return;
    }
    initPush(user.id).catch((e) => console.warn('[Push] init failed:', e));
  }, [user?.id]);

  const enable = useCallback(() => enablePushInteractive(), []);
  const test = useCallback(() => sendTestPush(), []);
  const disable = useCallback(() => disablePushOnThisDevice(), []);

  return {
    ...state,
    description: describeWebPushStatus(state.status as any, state.error || undefined),
    enable,
    test,
    disable,
  };
};

export default usePushNotifications;
