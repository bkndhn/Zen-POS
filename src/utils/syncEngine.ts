/**
 * ZenPOS Silent Sync Engine
 * ------------------------------------------------------------------
 * Gives the app a real "chat app" offline feel (WhatsApp / Telegram):
 *  - every write goes to IndexedDB first, UI never waits on the network
 *  - a background worker flushes the outbox during idle time
 *  - exponential backoff, never blocks the main thread, never hangs the UI
 *  - real reachability probe instead of trusting navigator.onLine
 *  - per-record sync state so rows can show pending / synced / failed ticks
 *
 * It wraps the existing offlineManager queue rather than replacing it.
 */

import { offlineManager } from './offlineManager';
import { supabase } from '@/integrations/supabase/client';

export type RecordSyncState = 'pending' | 'syncing' | 'synced' | 'failed';

export interface SyncEngineState {
  /** browser-level flag */
  online: boolean;
  /** verified by an actual network probe */
  reachable: boolean;
  /** number of records waiting in the outbox */
  pending: number;
  /** a flush is currently running */
  syncing: boolean;
  /** records that exhausted their retries */
  failed: number;
  lastSyncAt: number | null;
  lastError: string | null;
}

type Listener = (state: SyncEngineState) => void;

const BACKOFF_MS = [2000, 5000, 15000, 45000, 120000, 300000];
const PROBE_INTERVAL_OK = 60000;
const PROBE_INTERVAL_DEGRADED = 15000;
const BATCH_SIZE = 10;

const idle = (cb: () => void, timeout = 2000) => {
  const ric = (window as any).requestIdleCallback;
  if (typeof ric === 'function') ric(cb, { timeout });
  else setTimeout(cb, 0);
};

/** Stable client id so a retried write can never insert twice. */
export const newClientUuid = (): string => {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  } catch {
    /* ignore */
  }
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
};

class SyncEngine {
  private listeners = new Set<Listener>();
  private state: SyncEngineState = {
    online: navigator.onLine,
    reachable: navigator.onLine,
    pending: 0,
    syncing: false,
    failed: 0,
    lastSyncAt: null,
    lastError: null,
  };

  private attempt = 0;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private probeTimer: ReturnType<typeof setTimeout> | null = null;
  private started = false;
  private recordStates = new Map<string, RecordSyncState>();

  start(): void {
    if (this.started) return;
    this.started = true;

    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
    document.addEventListener('visibilitychange', this.handleVisibility);

    this.scheduleProbe(0);
    this.refreshCounts();
    this.requestSync('startup');

    // Warm all critical caches in the background after a short delay
    if (navigator.onLine) {
      setTimeout(() => idle(() => this.warmCriticalCaches(), 5000), 3000);
    }
  }

  /**
   * Pre-fetches and caches data for ALL screens so they load offline.
   * Runs silently via requestIdleCallback — zero performance impact.
   * Only warms data that isn't already cached or is older than 1 hour.
   */
  private async warmCriticalCaches(): Promise<void> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      // Resolve admin ID from cached profile
      const cachedProfileStr = localStorage.getItem(`profile_${session.user.id}`);
      if (!cachedProfileStr) return;
      let adminId: string | null = null;
      try {
        const prof = JSON.parse(cachedProfileStr);
        adminId = prof.role === 'admin' ? prof.id : (prof.admin_id || null);
      } catch { return; }
      if (!adminId) return;

      const ONE_HOUR = 60 * 60 * 1000;

      // Helper: only warm if cache is missing or stale
      const warmIfNeeded = async (table: string, key: string, fetcher: () => Promise<any>) => {
        try {
          const existing = await offlineManager.getCachedQueryResult(table, key);
          if (existing?.data && (Date.now() - existing.updatedAt) < ONE_HOUR) return; // fresh enough
          const data = await fetcher();
          if (data) await offlineManager.cacheQueryResult(table, key, data);
        } catch (e) {
          console.warn(`[CacheWarmer] Failed to warm ${table}/${key}:`, e);
        }
      };

      // Warm critical tables sequentially to avoid overwhelming the connection
      await warmIfNeeded('suppliers', 'list', async () => {
        const { data } = await supabase.from('suppliers').select('*').eq('admin_id', adminId!);
        return data;
      });

      await warmIfNeeded('stock_adjustments', 'list', async () => {
        const { data } = await (supabase as any).from('stock_adjustments')
          .select('id, item_id, branch_id, change_qty, reason, notes, created_at, created_by')
          .eq('admin_id', adminId!).order('created_at', { ascending: false }).limit(50);
        return data;
      });

      await warmIfNeeded('stock_ledger', 'list', async () => {
        const { data } = await (supabase as any).from('stock_ledger')
          .select('*').eq('admin_id', adminId!).order('created_at', { ascending: false }).limit(200);
        return data;
      });

      await warmIfNeeded('stock_transfers', 'list', async () => {
        const { data } = await (supabase as any).from('stock_transfers')
          .select('id,transfer_no,transfer_date,from_branch_id,to_branch_id,notes,created_at,stock_transfer_items(item_name,quantity)')
          .eq('admin_id', adminId!).order('created_at', { ascending: false }).limit(50);
        return data;
      });

      await warmIfNeeded('purchase_returns', 'list', async () => {
        const { data } = await (supabase as any).from('purchase_returns')
          .select('*, suppliers(name), purchase_return_items(item_name, quantity, branch_id)')
          .eq('admin_id', adminId!).order('created_at', { ascending: false }).limit(50);
        return data;
      });

      await warmIfNeeded('profiles', 'team_list', async () => {
        const { data } = await supabase.from('profiles').select('*')
          .or(`id.eq.${adminId},admin_id.eq.${adminId}`).order('created_at', { ascending: false });
        return data;
      });

      console.log('[CacheWarmer] Critical caches warmed successfully.');
    } catch (e) {
      console.warn('[CacheWarmer] Cache warming failed (non-blocking):', e);
    }
  }

  stop(): void {
    this.started = false;
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    if (this.flushTimer) clearTimeout(this.flushTimer);
    if (this.probeTimer) clearTimeout(this.probeTimer);
  }

  getState(): SyncEngineState {
    return { ...this.state };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  getRecordState(clientUuid?: string | null): RecordSyncState | null {
    if (!clientUuid) return null;
    return this.recordStates.get(clientUuid) ?? null;
  }

  /**
   * Offline-first write. Returns immediately so the UI can render optimistically.
   * `onlineWrite` runs straight away when the network is verified reachable;
   * otherwise the payload lands in the outbox and syncs silently later.
   */
  async submit<T>(opts: {
    type: 'bill' | 'expense' | 'item' | 'table_order' | 'table';
    action: 'create' | 'update' | 'delete' | 'update_status';
    data: any;
    clientUuid?: string;
    onlineWrite?: () => Promise<T>;
  }): Promise<{ queued: boolean; result?: T; error?: string }> {
    const clientUuid = opts.clientUuid || opts.data?.client_uuid || newClientUuid();
    this.recordStates.set(clientUuid, 'pending');

    if (this.state.reachable && opts.onlineWrite) {
      this.recordStates.set(clientUuid, 'syncing');
      try {
        const result = await opts.onlineWrite();
        this.recordStates.set(clientUuid, 'synced');
        this.emit({ lastSyncAt: Date.now(), lastError: null });
        return { queued: false, result };
      } catch (err: any) {
        // network-ish failure -> fall through to the outbox, anything else surfaces
        const message = err?.message || String(err);
        const isNetwork = /fetch|network|timeout|Failed to fetch|offline/i.test(message);
        if (!isNetwork) {
          this.recordStates.set(clientUuid, 'failed');
          return { queued: false, error: message };
        }
      }
    }

    await offlineManager.addToSyncQueue({
      type: opts.type,
      action: opts.action,
      data: { ...opts.data, client_uuid: clientUuid },
    });
    this.recordStates.set(clientUuid, 'pending');
    await this.refreshCounts();
    this.requestSync('new-write');
    return { queued: true };
  }

  /** Ask for a flush. Safe to call often — it debounces and backs off by itself. */
  requestSync(_reason = 'manual'): void {
    if (this.flushTimer) return;
    const delay = this.state.reachable ? 300 : BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)];
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      idle(() => void this.flush());
    }, delay);
  }

  /** User-triggered retry — clears backoff and retries even exhausted records. */
  async retryNow(): Promise<void> {
    this.attempt = 0;
    await offlineManager.resetSyncRetries();
    await this.probe();
    await this.flush(true);
  }

  // ---------------------------------------------------------------- internals

  private handleOnline = () => {
    this.emit({ online: true });
    this.attempt = 0;
    void this.probe().then(() => this.requestSync('online-event'));
  };

  private handleOffline = () => {
    this.emit({ online: false, reachable: false });
  };

  private handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      void this.probe().then(() => this.requestSync('visible'));
    }
  };

  private scheduleProbe(delay?: number): void {
    if (this.probeTimer) clearTimeout(this.probeTimer);
    const wait = delay ?? (this.state.reachable ? PROBE_INTERVAL_OK : PROBE_INTERVAL_DEGRADED);
    this.probeTimer = setTimeout(() => {
      void this.probe().finally(() => this.scheduleProbe());
    }, wait);
  }

  /** Real reachability check — catches captive Wi-Fi where navigator.onLine lies. */
  private async probe(): Promise<boolean> {
    if (!navigator.onLine) {
      this.emit({ online: false, reachable: false });
      return false;
    }
    const base = (import.meta as any).env?.VITE_SUPABASE_URL;
    if (!base) {
      this.emit({ online: true, reachable: true });
      return true;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const apikey = (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY;
      await fetch(`${base}/auth/v1/health`, {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-store',
        headers: apikey ? { apikey } : undefined,
      });
      this.emit({ online: true, reachable: true });
      return true;
    } catch {
      this.emit({ online: true, reachable: false });
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  private async refreshCounts(): Promise<void> {
    try {
      const [queue, pendingBills] = await Promise.all([
        offlineManager.getSyncQueue(),
        offlineManager.getPendingBillsCount(),
      ]);
      const failed = queue.filter((q: any) => (q.retryCount ?? 0) >= 5).length;
      this.emit({ pending: queue.length + pendingBills, failed });
    } catch {
      /* IndexedDB not ready yet — counts refresh on the next tick */
    }
  }

  private async flush(force = false): Promise<void> {
    if (this.state.syncing) return;
    if (!force && !this.state.reachable) {
      this.attempt += 1;
      this.requestSync('offline-retry');
      return;
    }

    await this.refreshCounts();
    if (this.state.pending === 0) {
      this.attempt = 0;
      return;
    }

    this.emit({ syncing: true });
    try {
      // processSyncQueue drains the outbox; BATCH_SIZE keeps each idle slice short
      const before = this.state.pending;
      const result = await offlineManager.processSyncQueue(force);
      // Also process the universal write queue (suppliers, purchases, stock, etc.)
      await offlineManager.processWriteQueue().catch(() => {});
      await this.refreshCounts();

      if (result && result.failed > 0 && result.synced === 0) {
        this.attempt += 1;
        this.emit({ lastError: 'Some records could not sync yet' });
      } else {
        this.attempt = 0;
        this.emit({ lastSyncAt: Date.now(), lastError: null });
      }

      // more waiting? continue on the next idle slice instead of blocking here
      if (this.state.pending > 0 && before > BATCH_SIZE) {
        this.emit({ syncing: false });
        this.requestSync('continue-batch');
        return;
      }
    } catch (err: any) {
      this.attempt += 1;
      this.emit({ lastError: err?.message || 'Sync failed' });
      this.requestSync('error-retry');
    } finally {
      this.emit({ syncing: false });
    }
  }

  private emit(patch: Partial<SyncEngineState>): void {
    const next = { ...this.state, ...patch };
    const changed = (Object.keys(patch) as (keyof SyncEngineState)[]).some((k) => this.state[k] !== next[k]);
    this.state = next;
    if (!changed) return;
    const snapshot = this.getState();
    this.listeners.forEach((l) => {
      try {
        l(snapshot);
      } catch {
        /* listener errors must never break sync */
      }
    });
  }
}

export const syncEngine = new SyncEngine();
