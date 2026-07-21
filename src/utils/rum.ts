/**
 * Real-User Monitoring (RUM) — lightweight client-side tracker.
 *
 * Buffers events locally and flushes to Supabase in small batches so we never
 * add latency to the hot path (billing, printing, item load). Super Admins
 * read the collected rows via the /super-admin/rum dashboard.
 */
import { supabase } from '@/integrations/supabase/client';

export type RumMetricType =
  | 'page_load'
  | 'cache_hit'
  | 'cache_miss'
  | 'offline_fallback'
  | 'query_slow'
  | 'error'
  | 'action';

interface RumEvent {
  metric_type: RumMetricType;
  metric_name: string;
  value_ms?: number | null;
  route?: string | null;
  meta?: Record<string, any> | null;
}

const BUFFER: RumEvent[] = [];
const MAX_BUFFER = 25;
const FLUSH_INTERVAL_MS = 15_000;
const SLOW_QUERY_MS = 1500;

let flushing = false;
let cachedAdminId: string | null = null;
let cachedUserId: string | null = null;
let started = false;

async function loadIds() {
  try {
    const { data } = await supabase.auth.getUser();
    cachedUserId = data.user?.id ?? null;
    if (cachedUserId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('admin_id, role')
        .eq('user_id', cachedUserId)
        .maybeSingle();
      cachedAdminId = (profile as any)?.admin_id ?? cachedUserId;
    }
  } catch {
    /* silent — RUM must never break the app */
  }
}

async function flush() {
  if (flushing || BUFFER.length === 0) return;
  flushing = true;
  const batch = BUFFER.splice(0, BUFFER.length);
  try {
    if (!cachedUserId) await loadIds();
    if (!cachedUserId) {
      // not signed in — drop batch silently
      return;
    }
    const rows = batch.map((e) => ({
      admin_id: cachedAdminId,
      user_id: cachedUserId,
      metric_type: e.metric_type,
      metric_name: e.metric_name,
      value_ms: e.value_ms ?? null,
      route: e.route ?? (typeof window !== 'undefined' ? window.location.pathname : null),
      meta: e.meta ?? null,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : null,
    }));
    await supabase.from('rum_events').insert(rows as any);
  } catch {
    /* silent */
  } finally {
    flushing = false;
  }
}

export function trackRum(event: RumEvent) {
  try {
    BUFFER.push(event);
    if (BUFFER.length >= MAX_BUFFER) void flush();
  } catch {
    /* silent */
  }
}

export const rum = {
  pageLoad(name: string, ms: number, meta?: Record<string, any>) {
    trackRum({ metric_type: 'page_load', metric_name: name, value_ms: ms, meta });
  },
  cacheHit(name: string) {
    trackRum({ metric_type: 'cache_hit', metric_name: name });
  },
  cacheMiss(name: string) {
    trackRum({ metric_type: 'cache_miss', metric_name: name });
  },
  offlineFallback(name: string, meta?: Record<string, any>) {
    trackRum({ metric_type: 'offline_fallback', metric_name: name, meta });
  },
  query(name: string, ms: number) {
    if (ms >= SLOW_QUERY_MS) {
      trackRum({ metric_type: 'query_slow', metric_name: name, value_ms: ms });
    }
  },
  error(name: string, message: string) {
    trackRum({ metric_type: 'error', metric_name: name, meta: { message: String(message).slice(0, 500) } });
  },
  action(name: string, ms?: number, meta?: Record<string, any>) {
    trackRum({ metric_type: 'action', metric_name: name, value_ms: ms, meta });
  },
};

export function startRum() {
  if (started || typeof window === 'undefined') return;
  started = true;

  void loadIds();

  // Periodic flush
  setInterval(() => void flush(), FLUSH_INTERVAL_MS);

  // Flush on tab hide
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush();
  });

  // Initial page load timing via Navigation Timing API
  try {
    window.addEventListener('load', () => {
      setTimeout(() => {
        const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
        if (nav) {
          const total = Math.round(nav.loadEventEnd - nav.startTime);
          if (total > 0 && total < 120_000) {
            rum.pageLoad('initial_load', total, {
              domContentLoaded: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
              type: nav.type,
            });
          }
        }
      }, 0);
    });
  } catch {
    /* ignore */
  }

  // Global error hooks
  window.addEventListener('error', (e) => rum.error('window.error', e.message || 'unknown'));
  window.addEventListener('unhandledrejection', (e) =>
    rum.error('unhandledrejection', (e.reason && (e.reason.message || String(e.reason))) || 'unknown'),
  );
}

// Reset cached ids on sign-out
supabase.auth.onAuthStateChange((_evt, session) => {
  cachedUserId = session?.user?.id ?? null;
  cachedAdminId = null;
  if (cachedUserId) void loadIds();
});
