import * as React from 'react';
import { WifiOff, CloudOff, RefreshCw, CheckCircle2 } from 'lucide-react';
import { useNetworkStatus, usePendingSyncCount, useWriteQueueCount } from '@/hooks/useOffline';
import { offlineManager } from '@/utils/offlineManager';

const OfflineStatusBanner: React.FC = () => {
    const isOnline = useNetworkStatus();
    const pendingBills = usePendingSyncCount();
    const pendingWrites = useWriteQueueCount();
    const [syncing, setSyncing] = React.useState(false);
    const [justSynced, setJustSynced] = React.useState(false);

    const totalPending = pendingBills + pendingWrites;

    // Show a brief "synced" message after coming back online
    React.useEffect(() => {
        if (isOnline && totalPending === 0 && justSynced) {
            const timer = setTimeout(() => setJustSynced(false), 3000);
            return () => clearTimeout(timer);
        }
    }, [isOnline, totalPending, justSynced]);

    // Auto-trigger sync when online with pending items (no manual click needed)
    const autoSyncTriggered = React.useRef(false);
    React.useEffect(() => {
        if (isOnline && totalPending > 0 && !syncing && !autoSyncTriggered.current) {
            autoSyncTriggered.current = true;
            const timer = setTimeout(() => {
                handleRetry();
            }, 2000);
            return () => clearTimeout(timer);
        }
        if (totalPending === 0) {
            autoSyncTriggered.current = false;
        }
    }, [isOnline, totalPending, syncing]);

    const handleRetry = async () => {
        setSyncing(true);
        try {
            // Reset ALL stuck retries (both bills and writeQueue)
            await offlineManager.resetSyncRetries();
            await offlineManager.resetWriteQueueRetries();
            // Release any items stuck in 'syncing' from crashed sessions
            // @ts-ignore: backend is private but we need to access it here
            if (offlineManager.backend?.isReady()) {
                // @ts-ignore
                await offlineManager.backend.releaseStaleClaims(0);
            }
            // Now process everything
            await offlineManager.processSyncQueue(true);
            await offlineManager.processWriteQueue();
            setJustSynced(true);
        } catch (err) {
            console.error('[OfflineBanner] Manual sync failed:', err);
        } finally {
            setSyncing(false);
        }
    };

    // If online and nothing pending and not just synced, hide banner
    if (isOnline && totalPending === 0 && !justSynced) return null;

    // Just synced success message
    if (isOnline && totalPending === 0 && justSynced) {
        return (
            <div className="fixed top-0 left-0 right-0 z-[9999] bg-emerald-600 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium animate-in slide-in-from-top duration-300 shadow-lg">
                <CheckCircle2 className="w-4 h-4" />
                All changes synced successfully!
            </div>
        );
    }

    // Online but pending syncs
    if (isOnline && totalPending > 0) {
        return (
            <div className="fixed top-0 left-0 right-0 z-[9999] bg-amber-600 text-white px-4 py-2 flex items-center justify-between text-sm font-medium animate-in slide-in-from-top duration-300 shadow-lg">
                <div className="flex items-center gap-2">
                    <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                    {syncing ? 'Syncing...' : `${totalPending} change${totalPending > 1 ? 's' : ''} pending sync`}
                </div>
                {!syncing && (
                    <button onClick={handleRetry} className="bg-white/20 hover:bg-white/30 px-3 py-0.5 rounded-lg text-xs font-bold transition-colors">
                        Sync Now
                    </button>
                )}
            </div>
        );
    }

    // Offline
    return (
        <div className="fixed top-0 left-0 right-0 z-[9999] bg-red-600 text-white px-4 py-2 flex items-center justify-between text-sm font-medium animate-in slide-in-from-top duration-300 shadow-lg">
            <div className="flex items-center gap-2">
                <WifiOff className="w-4 h-4" />
                You're offline — changes will sync when connection returns
                {totalPending > 0 && (
                    <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs font-bold">
                        {totalPending} pending
                    </span>
                )}
            </div>
            <CloudOff className="w-4 h-4 opacity-60" />
        </div>
    );
};

export default OfflineStatusBanner;
