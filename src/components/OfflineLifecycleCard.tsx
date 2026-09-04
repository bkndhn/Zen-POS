import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Database, RefreshCw, CloudUpload, Clock, HardDrive } from 'lucide-react';
import { offlineManager } from '@/utils/offlineManager';
import { syncEngine } from '@/utils/syncEngine';
import { useSyncEngine } from '@/hooks/useOffline';

type Stats = Awaited<ReturnType<typeof offlineManager.getOfflineLifecycleStats>>;

const relativeTime = (ts: number | null): string => {
  if (!ts) return 'Never';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'Just now';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}hr ${mins % 60}min ago`;
  return `${Math.floor(hrs / 24)} day(s) ago`;
};

const prettyStore = (s: string) =>
  s.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

export const OfflineLifecycleCard: React.FC = () => {
  const engine = useSyncEngine();
  const [stats, setStats] = React.useState<Stats | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setStats(await offlineManager.getOfflineLifecycleStats());
    } catch {
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  const lastSync = engine.lastSyncAt ?? stats?.lastSyncAt ?? null;
  const queued = (stats?.writeQueue.total ?? 0) + (stats?.syncQueue ?? 0) + (stats?.pendingBills ?? 0);

  return (
    <Card className="animate-fade-in">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4 text-primary" />
              Offline Lifecycle
            </CardTitle>
            <CardDescription>Queued writes, last sync and locally cached rows.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={stats?.backend === 'sqlite' ? 'default' : 'secondary'}>
              {stats?.backend === 'sqlite' ? 'SQLite' : 'IndexedDB'}
            </Badge>
            <Button size="icon" variant="ghost" onClick={() => void load()} aria-label="Refresh offline stats">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border bg-muted/40 p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CloudUpload className="h-3.5 w-3.5" /> Queued
            </div>
            <div className="mt-1 text-xl font-semibold">{queued}</div>
          </div>
          <div className="rounded-lg border bg-muted/40 p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" /> Last sync
            </div>
            <div className="mt-1 text-sm font-semibold">{relativeTime(lastSync)}</div>
          </div>
          <div className="rounded-lg border bg-muted/40 p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <HardDrive className="h-3.5 w-3.5" /> Cached rows
            </div>
            <div className="mt-1 text-xl font-semibold">{stats?.totalCachedRows ?? 0}</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="secondary">Pending writes: {stats?.writeQueue.pending ?? 0}</Badge>
          <Badge variant="secondary">Syncing: {stats?.writeQueue.syncing ?? 0}</Badge>
          <Badge variant={stats?.writeQueue.failed ? 'destructive' : 'secondary'}>
            Failed: {stats?.writeQueue.failed ?? 0}
          </Badge>
          <Badge variant="secondary">Bills waiting: {stats?.pendingBills ?? 0}</Badge>
          <Badge variant="secondary">Legacy queue: {stats?.syncQueue ?? 0}</Badge>
          {stats?.writeQueue.oldest && (
            <Badge variant="outline">Oldest queued: {relativeTime(stats.writeQueue.oldest)}</Badge>
          )}
        </div>

        <div className="rounded-lg border">
          <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">Cached rows by store</div>
          <div className="max-h-56 overflow-y-auto divide-y">
            {(stats?.cachedRows ?? []).map((row) => (
              <div key={row.store} className="flex items-center justify-between px-3 py-1.5 text-sm">
                <span className="text-muted-foreground">{prettyStore(row.store)}</span>
                <span className="font-medium tabular-nums">{row.count}</span>
              </div>
            ))}
            {!loading && !stats && (
              <div className="px-3 py-3 text-sm text-muted-foreground">Local storage not ready yet.</div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {engine.reachable ? 'Server reachable' : engine.online ? 'No server connection' : 'Device offline'}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={engine.syncing}
            onClick={async () => {
              await syncEngine.retryNow();
              await load();
            }}
          >
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${engine.syncing ? 'animate-spin' : ''}`} />
            Sync now
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default OfflineLifecycleCard;
