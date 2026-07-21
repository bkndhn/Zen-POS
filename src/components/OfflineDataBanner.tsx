import React from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  /** True when the last query failed AND we still have cached data to show. */
  isStale: boolean;
  /** True when the query failed AND we have no cached data at all. */
  hasNoData?: boolean;
  onRetry: () => void;
  message?: string;
}

/**
 * Non-blocking "showing cached data" banner. Pair with a React Query
 * `useQuery` result: pass `isStale = isError && data != null` and
 * `hasNoData = isError && data == null`. When Supabase throttles or the
 * network drops, users keep seeing the last IndexedDB-cached list and can
 * hit Retry instead of staring at a blank screen.
 */
export const OfflineDataBanner: React.FC<Props> = ({
  isStale,
  hasNoData,
  onRetry,
  message,
}) => {
  React.useEffect(() => {
    if (isStale || hasNoData) {
      import('@/utils/rum').then(m => m.rum.offlineFallback(hasNoData ? 'no_data' : 'stale')).catch(() => {});
    }
  }, [isStale, hasNoData]);

  if (!isStale && !hasNoData) return null;

  if (hasNoData) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
        <WifiOff className="h-8 w-8 text-muted-foreground" />
        <div className="text-sm text-muted-foreground max-w-xs">
          {message ?? "Couldn't reach the server and no offline copy is available yet."}
        </div>
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RefreshCw className="h-4 w-4 mr-2" /> Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-foreground mb-3">
      <div className="flex items-center gap-2 min-w-0">
        <WifiOff className="h-4 w-4 shrink-0" />
        <span className="truncate">
          {message ?? 'Showing saved offline data — server unreachable.'}
        </span>
      </div>
      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={onRetry}>
        <RefreshCw className="h-3.5 w-3.5 mr-1" /> Retry
      </Button>
    </div>
  );
};

export default OfflineDataBanner;
