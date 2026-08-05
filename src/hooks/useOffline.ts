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

// Hook for pending sync count
export function usePendingSyncCount(): number {
    const [count, setCount] = React.useState(0);

    React.useEffect(() => {
        const updateCount = async () => {
            const pendingCount = await offlineManager.getPendingBillsCount();
            setCount(pendingCount);
        };

        updateCount();

        // Update count periodically
        const interval = setInterval(updateCount, 5000);
        return () => clearInterval(interval);
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
