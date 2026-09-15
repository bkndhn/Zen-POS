import React from 'react';
import { WifiOff } from 'lucide-react';
import { useSyncEngine } from '@/hooks/useOffline';

/**
 * Thin, non-blocking sync bar (chat-app style).
 * Never renders a modal or spinner overlay — it only hints at background work.
 */
export const SyncStatusBar: React.FC = () => {
  const state = useSyncEngine();

  const degraded = !state.online || !state.reachable;

  // Silent by design: syncing and pending counts never surface.
  // Only a true connectivity loss is worth telling the user about.
  if (!degraded) return null;

  return (
    <div className="w-full">
      <div className="flex items-center justify-center gap-2 px-3 py-1 text-[11px] font-medium">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-muted-foreground">
          <WifiOff className="h-3 w-3" />
          {state.online ? 'No connection to server' : 'Offline'}
        </span>
      </div>
    </div>
  );
};

export default SyncStatusBar;
