import React from 'react';
import { WifiOff, RefreshCw, Cloud, CloudOff } from 'lucide-react';
import { useNetworkStatus, usePendingSyncCount } from '@/hooks/useOffline';
import { offlineManager } from '@/utils/offlineManager';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface OfflineIndicatorProps {
    className?: string;
    showSyncButton?: boolean;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({
    className = '',
    showSyncButton = true
}) => {
    const isOnline = useNetworkStatus();
    const pendingCount = usePendingSyncCount();
    const [syncing, setSyncing] = React.useState(false);

    const handleSync = async () => {
        if (!isOnline || syncing) return;

        setSyncing(true);
        try {
            await offlineManager.processSyncQueue(true);
        } finally {
            setSyncing(false);
        }
    };

    if (isOnline && pendingCount === 0) {
        return null; // Don't show anything when online with no pending items
    }

    return (
        <div className={`flex items-center gap-2 ${className}`}>
            {!isOnline ? (
                <Badge
                    variant="secondary"
                    className="offline-banner text-white px-3 py-1.5 flex items-center gap-2 animate-pulse"
                >
                    <WifiOff className="w-4 h-4" />
                    <span className="font-medium">Offline Mode</span>
                </Badge>
            ) : pendingCount > 0 ? (
                <Badge
                    variant="outline"
                    className="border-amber-400 bg-amber-50 text-amber-700 px-3 py-1.5 flex items-center gap-2"
                >
                    <CloudOff className="w-4 h-4" />
                    <span>{pendingCount} pending</span>
                </Badge>
            ) : null}

            {showSyncButton && isOnline && pendingCount > 0 && (
                <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSync}
                    disabled={syncing}
                    className="h-8"
                >
                    <RefreshCw className={`w-4 h-4 mr-1 ${syncing ? 'animate-spin' : ''}`} />
                    Sync
                </Button>
            )}
        </div>
    );
};

// Compact version for headers
export const OfflineStatusIcon: React.FC = () => {
    const isOnline = useNetworkStatus();
    const pendingCount = usePendingSyncCount();

    if (isOnline && pendingCount === 0) {
        return (
            <div className="flex items-center text-green-600">
                <Cloud className="w-4 h-4" />
            </div>
        );
    }

    if (!isOnline) {
        return (
            <div className="flex items-center text-amber-500 animate-pulse">
                <WifiOff className="w-4 h-4" />
            </div>
        );
    }

    return (
        <div className="flex items-center text-amber-500 relative">
            <CloudOff className="w-4 h-4" />
            <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                {pendingCount}
            </span>
        </div>
    );
};
