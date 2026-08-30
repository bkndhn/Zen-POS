/**
 * Production error monitoring.
 *
 * Reports client + server failures to Sentry (and the RUM table) immediately:
 *  - Supabase/PostgREST query failures (RLS 42501, missing column 42703, ...)
 *  - HTTP 401 / 403 / 404 / 5xx responses from any fetch call
 *  - Unhandled runtime errors and promise rejections
 *  - Explicit "missing field" reports from UI code
 *
 * Never throws — monitoring must not break a user flow.
 */
import * as Sentry from '@sentry/react';
import { rum } from './rum';

export type MonitoredCategory =
  | 'supabase_query'
  | 'http_status'
  | 'missing_field'
  | 'realtime'
  | 'runtime';

interface ReportOptions {
  category: MonitoredCategory;
  message: string;
  context?: Record<string, unknown>;
  level?: 'warning' | 'error' | 'fatal';
}

/** De-dupe identical alerts within a short window so we never spam Sentry. */
const recent = new Map<string, number>();
const DEDUPE_MS = 30_000;

const shouldReport = (key: string) => {
  const now = Date.now();
  const last = recent.get(key);
  if (last && now - last < DEDUPE_MS) return false;
  recent.set(key, now);
  if (recent.size > 200) recent.clear();
  return true;
};

export function reportIssue({ category, message, context, level = 'error' }: ReportOptions): void {
  try {
    const key = `${category}:${message}`;
    if (!shouldReport(key)) return;

    Sentry.withScope((scope) => {
      scope.setTag('alert_category', category);
      scope.setTag('connection_state', navigator.onLine ? 'online' : 'offline');
      scope.setLevel(level);

      // Add rich Supabase context
      if (context) {
        scope.setContext('supabase_details', context as Record<string, unknown>);
        if (context.code) scope.setTag('pg_error_code', String(context.code));
        if (context.label) scope.setTag('query_label', String(context.label));
        if (context.table) scope.setTag('db_table', String(context.table));
      }

      // Group realtime errors together
      if (category === 'realtime') {
        scope.setFingerprint(['realtime', context?.channelName as string || message]);
      }

      Sentry.captureMessage(`[${category}] ${message}`, level);
    });

    rum.error(category, message);

    if (import.meta.env.DEV) {
      console.warn(`[monitor:${category}]`, message, context || '');
    }
  } catch {
    /* silent */
  }
}

/** Wrap a Supabase result and alert when it failed. Returns the data (or null). */
export function checkSupabaseResult<T>(
  label: string,
  result: { data: T | null; error: { message: string; code?: string; details?: string } | null },
): T | null {
  if (result.error) {
    const code = result.error.code || 'unknown';
    reportIssue({
      category: 'supabase_query',
      message: `${label} failed (${code}): ${result.error.message}`,
      context: { label, code, details: result.error.details },
      level: code === '42501' || code === '42703' ? 'fatal' : 'error',
    });
  }
  return result.data ?? null;
}

/** Report a record that is missing an expected field before it breaks the UI. */
export function reportMissingField(entity: string, field: string, context?: Record<string, unknown>) {
  reportIssue({
    category: 'missing_field',
    message: `${entity} is missing required field "${field}"`,
    context,
    level: 'warning',
  });
}

let installed = false;

/** Installs global fetch/error hooks. Call once at boot. */
export function installErrorMonitoring(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    try {
      const res = await originalFetch(input as any, init);
      if (!res.ok && [401, 403, 404, 500, 502, 503].includes(res.status)) {
        // Ignore expected auth probes on the token endpoint (handled by the SDK).
        const isTokenRefresh = url.includes('/auth/v1/token');
        if (!isTokenRefresh) {
          reportIssue({
            category: 'http_status',
            message: `HTTP ${res.status} on ${safeUrl(url)}`,
            context: { status: res.status, url: safeUrl(url), method: init?.method || 'GET' },
            level: res.status >= 500 ? 'fatal' : 'error',
          });
        }
      }
      return res;
    } catch (err: any) {
      // Network failure — offline mode handles this, so warn only.
      reportIssue({
        category: 'http_status',
        message: `Network failure on ${safeUrl(url)}: ${err?.message || 'unknown'}`,
        context: { url: safeUrl(url) },
        level: 'warning',
      });
      throw err;
    }
  };

  window.addEventListener('error', (e) => {
    reportIssue({ category: 'runtime', message: e.message || 'window.error', context: { source: e.filename } });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reason: any = (e as PromiseRejectionEvent).reason;
    reportIssue({
      category: 'runtime',
      message: reason?.message || String(reason || 'unhandledrejection'),
    });
  });
}

/** Strips query strings / tokens before an URL is sent anywhere. */
function safeUrl(url: string): string {
  try {
    const u = new URL(url, window.location.origin);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url.split('?')[0];
  }
}
