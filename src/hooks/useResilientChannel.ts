/**
 * Realtime channel with automatic retry + polling fallback.
 *
 * Supabase websockets drop on flaky restaurant wifi. This hook:
 *  - re-subscribes with exponential backoff on CHANNEL_ERROR / TIMED_OUT / CLOSED
 *  - falls back to periodic refetch while disconnected, so the UI stays fresh
 *  - refetches once on every successful (re)connect to close any data gap
 *  - refetches when the tab becomes visible or the browser regains network
 */
import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { reportIssue } from '@/utils/monitoring';

export type RealtimeStatus = 'connecting' | 'live' | 'reconnecting' | 'offline';

interface Options {
  /** Unique channel name. Pass null to disable the subscription. */
  channelName: string | null;
  table: string;
  filter?: string;
  schema?: string;
  /** Called for every postgres change while connected. */
  onChange: (payload: any) => void;
  /** Full refetch used on (re)connect and while falling back to polling. */
  onResync: () => void | Promise<void>;
  /** Poll interval used while the socket is down (ms). */
  fallbackIntervalMs?: number;
}

const MAX_BACKOFF_MS = 30_000;

export function useResilientChannel({
  channelName,
  table,
  filter,
  schema = 'public',
  onChange,
  onResync,
  fallbackIntervalMs = 15_000,
}: Options): { status: RealtimeStatus; reconnect: () => void } {
  const [status, setStatus] = useState<RealtimeStatus>('connecting');
  const onChangeRef = useRef(onChange);
  const onResyncRef = useRef(onResync);
  const attemptRef = useRef(0);
  const [manualNonce, setManualNonce] = useState(0);

  onChangeRef.current = onChange;
  onResyncRef.current = onResync;

  useEffect(() => {
    if (!channelName) return;

    let channel: RealtimeChannel | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let disposed = false;

    const stopPolling = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    const startPolling = () => {
      if (pollTimer || disposed) return;
      pollTimer = setInterval(() => {
        void onResyncRef.current();
      }, fallbackIntervalMs);
    };

    const scheduleRetry = () => {
      if (disposed || retryTimer) return;
      const delay = Math.min(1000 * 2 ** attemptRef.current, MAX_BACKOFF_MS);
      attemptRef.current += 1;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        connect();
      }, delay);
    };

    const connect = () => {
      if (disposed) return;
      if (channel) {
        supabase.removeChannel(channel);
        channel = null;
      }
      setStatus(attemptRef.current === 0 ? 'connecting' : 'reconnecting');

      channel = supabase
        .channel(`${channelName}-${attemptRef.current}`)
        .on(
          'postgres_changes' as any,
          { event: '*', schema, table, ...(filter ? { filter } : {}) } as any,
          (payload: any) => onChangeRef.current(payload),
        )
        .subscribe((subStatus: string) => {
          if (disposed) return;
          if (subStatus === 'SUBSCRIBED') {
            attemptRef.current = 0;
            stopPolling();
            setStatus('live');
            void onResyncRef.current();
          } else if (subStatus === 'CHANNEL_ERROR' || subStatus === 'TIMED_OUT' || subStatus === 'CLOSED') {
            setStatus(navigator.onLine ? 'reconnecting' : 'offline');
            startPolling();
            void onResyncRef.current();
            if (attemptRef.current === 1) {
              reportIssue({
                category: 'realtime',
                message: `Realtime channel "${channelName}" (${table}) disconnected: ${subStatus}`,
                level: 'warning',
              });
            }
            scheduleRetry();
          }
        });
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void onResyncRef.current();
        if (status !== 'live') connect();
      }
    };
    const handleOnline = () => {
      attemptRef.current = 0;
      connect();
    };
    const handleOffline = () => {
      setStatus('offline');
      startPolling();
    };

    connect();
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      stopPolling();
      if (channel) supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, table, filter, schema, fallbackIntervalMs, manualNonce]);

  return {
    status,
    reconnect: () => {
      attemptRef.current = 0;
      setManualNonce((n) => n + 1);
    },
  };
}
