import * as React from 'react';
import { offlineManager } from '@/utils/offlineManager';

// Hook for network status with reactive updates
export function useNetworkStatus(): boolean {
    const [isOnline, setIsOnline] = React.useState(navigator.onLine);

    React.useEffect(() => {
        const unsubscribe = offlineManager.onNetworkChange(setIsOnline);
        return unsubscribe;
    }, []);

    return isOnline;
}

// Hook for offline data with automatic caching
export function useOfflineData<T>(
    key: string,
    fetchFn: () => Promise<T[]>,
    cacheFn: (data: T[]) => Promise<void>,
    getCacheFn: () => Promise<T[]>
): {
    data: T[];
    loading: boolean;
    error: string | null;
    isOffline: boolean;
    refresh: () => Promise<void>;
} {
    const [data, setData] = React.useState<T[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const isOnline = useNetworkStatus();

    const fetchData = React.useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            if (isOnline) {
                // Online: fetch fresh data and cache it
                const freshData = await fetchFn();
                setData(freshData);
                await cacheFn(freshData);
            } else {
                // Offline: use cached data
                const cachedData = await getCacheFn();
                if (cachedData.length > 0) {
                    setData(cachedData);
                } else {
                    setError('No cached data available');
                }
            }
        } catch (err) {
            console.error('Error fetching data:', err);

            // Try to use cached data as fallback
            try {
                const cachedData = await getCacheFn();
                if (cachedData.length > 0) {
                    setData(cachedData);
                    setError(null); // Clear error if cache works
                } else {
                    setError(isOnline ? 'Failed to fetch data' : 'You are offline and no cached data is available');
                }
            } catch {
                setError('Failed to load data');
            }
        } finally {
            setLoading(false);
        }
    }, [isOnline, fetchFn, cacheFn, getCacheFn]);

    React.useEffect(() => {
        fetchData();
    }, [fetchData]);

    return {
        data,
        loading,
        error,
        isOffline: !isOnline,
        refresh: fetchData
    };
}

/**
 * Universal offline-first query hook.
 * ONLINE:  Network fetch first → update cache → show fresh data. Cache is fallback only on failure.
 * OFFLINE: Load from IndexedDB cache instantly.
 * This ensures online users ALWAYS see fresh data — no stale cache flashing.
 */
export function useOfflineQuery<T>(
    tableName: string,
    queryFn: () => Promise<T[]>,
    options?: {
        cacheKey?: string;
        staleTimeMs?: number;
        enabled?: boolean;
    }
): {
    data: T[];
    loading: boolean;
    isStale: boolean;
    isOffline: boolean;
    lastUpdated: number | null;
    refresh: () => Promise<void>;
    error: string | null;
} {
    const [data, setData] = React.useState<T[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [isStale, setIsStale] = React.useState(false);
    const [lastUpdated, setLastUpdated] = React.useState<number | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const isOnline = useNetworkStatus();
    const cacheKey = options?.cacheKey ?? 'default';
    const enabled = options?.enabled ?? true;

    const refresh = React.useCallback(async () => {
        if (!enabled) return;
        setLoading(true);
        setError(null);

        if (isOnline || navigator.onLine) {
            // ── ONLINE: Network first, cache as fallback ──
            try {
                const freshData = await queryFn();
                setData(freshData);
                setIsStale(false);
                const now = Date.now();
                setLastUpdated(now);
                // Silently update cache in background (don't block UI)
                offlineManager.cacheQueryResult(tableName, cacheKey, freshData).catch(() => {});
            } catch (err: any) {
                console.warn(`[useOfflineQuery] Network failed for ${tableName}, trying cache:`, err?.message);
                // Network failed — try cache as fallback
                try {
                    const cached = await offlineManager.getCachedQueryResult(tableName, cacheKey);
                    if (cached?.data?.length > 0) {
                        setData(cached.data as T[]);
                        setLastUpdated(cached.updatedAt);
                        setIsStale(true);
                    } else {
                        setError('Failed to fetch data and no cache available.');
                    }
                } catch {
                    setError('Failed to load data.');
                }
            }
        } else {
            // ── OFFLINE: Cache only ──
            try {
                const cached = await offlineManager.getCachedQueryResult(tableName, cacheKey);
                if (cached?.data?.length > 0) {
                    setData(cached.data as T[]);
                    setLastUpdated(cached.updatedAt);
                    setIsStale(true);
                } else {
                    setError('You are offline. No cached data available.');
                }
            } catch {
                setError('You are offline. Cache read failed.');
            }
        }
        setLoading(false);
    }, [enabled, isOnline, tableName, cacheKey, queryFn]);

    React.useEffect(() => {
        refresh();
    }, [refresh]);

    return { data, loading, isStale, isOffline: !isOnline, lastUpdated, refresh, error };
}

/** Hook to track pending write queue count */
export function useWriteQueueCount(): number {
    const [count, setCount] = React.useState(0);

    React.useEffect(() => {
        const update = async () => {
            const c = await offlineManager.getPendingWriteCount();
            setCount(c);
        };
        update();
        const unsub = offlineManager.onWriteQueueChange(setCount);
        return unsub;
    }, []);

    return count;
}

// Hook for pending sync count (event-driven, no polling)
export function usePendingSyncCount(): number {
    const [count, setCount] = React.useState(0);

    React.useEffect(() => {
        // Initial check
        offlineManager.getPendingBillsCount().then(setCount).catch(() => {});
        // Event-driven updates (no polling)
        const unsub = offlineManager.onPendingBillsChange(setCount);
        return unsub;
    }, []);

    return count;
}

// ---------------------------------------------------------------------------
// Silent sync engine hooks
// ---------------------------------------------------------------------------
import { syncEngine, type SyncEngineState, type RecordSyncState } from '@/utils/syncEngine';

/** Live state of the background sync engine (offline-first, never blocking). */
export function useSyncEngine(): SyncEngineState {
    const [state, setState] = React.useState<SyncEngineState>(() => syncEngine.getState());

    React.useEffect(() => syncEngine.subscribe(setState), []);

    return state;
}

/** Per-record sync ticks (pending / syncing / synced / failed), chat-app style. */
export function useSyncState(clientUuid?: string | null): RecordSyncState | null {
    const [state, setState] = React.useState<RecordSyncState | null>(() =>
        syncEngine.getRecordState(clientUuid)
    );

    React.useEffect(() => {
        setState(syncEngine.getRecordState(clientUuid));
        return syncEngine.subscribe(() => setState(syncEngine.getRecordState(clientUuid)));
    }, [clientUuid]);

    return state;
}
