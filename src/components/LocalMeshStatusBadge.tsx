import React, { useState, useEffect } from 'react';
import { localMeshSync } from '@/utils/localMeshSync';
import { Badge } from '@/components/ui/badge';
import { Wifi, WifiOff, Cloud, RefreshCw, Radio } from 'lucide-react';
import { cn } from '@/lib/utils';

export const LocalMeshStatusBadge: React.FC<{ className?: string }> = ({ className }) => {
  const [status, setStatus] = useState<{ isOnline: boolean; meshActive: boolean; pendingCount: number }>({
    isOnline: navigator.onLine,
    meshActive: true,
    pendingCount: 0,
  });

  useEffect(() => {
    const unsubscribe = localMeshSync.subscribeMeshStatus(setStatus);
    return unsubscribe;
  }, []);

  if (status.isOnline && status.pendingCount === 0) {
    return null;
  }

  if (status.isOnline && status.pendingCount > 0) {
    return (
      <Badge 
        variant="outline" 
        className={cn("bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800 text-[11px] gap-1 px-2 py-0.5 font-semibold animate-pulse shadow-2xs", className)}
        title="Syncing pending offline bills to cloud database"
      >
        <RefreshCw className="w-3 h-3 animate-spin text-blue-600" />
        Syncing ({status.pendingCount} pending)
      </Badge>
    );
  }

  return (
    <Badge 
      variant="outline" 
      className={cn("bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-700 text-[11px] gap-1 px-2 py-0.5 font-semibold shadow-2xs", className)}
      title="Offline Mode: Saved to phone storage (Auto-syncs when online)"
    >
      <WifiOff className="w-3 h-3 text-amber-600" />
      Offline (Saved to Phone)
    </Badge>
  );
};
