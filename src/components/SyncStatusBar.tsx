import React from 'react';
import { CloudOff, RefreshCw, WifiOff, Check } from 'lucide-react';
import { useSyncEngine } from '@/hooks/useOffline';
import { syncEngine } from '@/utils/syncEngine';

/**
 * Thin, non-blocking sync bar (chat-app style).
 * Never renders a modal or spinner overlay — it only hints at background work.
 */
export const SyncStatusBar: React.FC = () => {
  const state = useSyncEngine();
  const [justSynced, setJustSynced] = React.useState(false);
  const lastSyncRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (state.lastSyncAt && state.lastSyncAt !== lastSyncRef.current) {
      lastSyncRef.current = state.lastSyncAt;
      if (state.pending === 0) {
        setJustSynced(true);
        const t = setTimeout(() => setJustSynced(false), 1800);
        return () => clearTimeout(t);
      }
    }
  }, [state.lastSyncAt, state.pending]);

  const degraded = !state.online || !state.reachable;

  if (!degraded && state.pending === 0 && !state.syncing && !justSynced) return null;

  return (
    <div className="w-full">
      {state.syncing && (
        <div className="h-0.5 w-full overflow-hidden bg-transparent">
          <div className="h-full w-1/3 bg-primary/70 animate-[shimmer_1.2s_ease-in-out_infinite]" />
        </div>
      )}
      <div className="flex items-center justify-center gap-2 px-3 py-1 text-[11px] font-medium">
        {degraded ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-muted-foreground">
            <WifiOff className="h-3 w-3" />
            {state.online ? 'No connection to server' : 'Offline'}
            {state.pending > 0 && ` · ${state.pending} waiting`}
          </span>
        ) : state.syncing ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-primary">
            <RefreshCw className="h-3 w-3 animate-spin" />
            Syncing{state.pending > 0 ? ` ${state.pending}` : ''}…
          </span>
        ) : state.pending > 0 ? (
          <button
            type="button"
            onClick={() => void syncEngine.retryNow()}
            className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-amber-600 dark:text-amber-400"
          >
            <CloudOff className="h-3 w-3" />
            {state.pending} pending · tap to retry
          </button>
        ) : justSynced ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-0.5 text-success">
            <Check className="h-3 w-3" />
            All synced
          </span>
        ) : null}
      </div>
    </div>
  );
};

export default SyncStatusBar;
