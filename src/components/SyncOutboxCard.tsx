import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Download, CloudOff, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { offlineManager } from '@/utils/offlineManager';
import { useSyncEngine, useNetworkStatus } from '@/hooks/useOffline';

export function SyncOutboxCard() {
  const engine = useSyncEngine();
  const online = useNetworkStatus();
  const [bills, setBills] = useState<any[]>([]);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(() => { offlineManager.getPendingBills().then(setBills).catch(() => setBills([])); }, []);
  useEffect(() => { load(); return offlineManager.onPendingBillsChange(() => load()); }, [load]);

  const syncNow = async () => {
    setSyncing(true);
    try { await offlineManager.processSyncQueue(true); } finally { setSyncing(false); load(); }
  };

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(bills, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `zenpos-unsynced-bills-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-base flex items-center gap-2">
        {bills.length ? <CloudOff className="h-4 w-4 text-warning" /> : <CheckCircle2 className="h-4 w-4 text-success" />}
        Bills waiting to upload
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-3 text-sm">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md bg-muted p-2"><div className="text-xl font-bold">{bills.length}</div><div className="text-xs text-muted-foreground">Waiting</div></div>
        <div className="rounded-md bg-muted p-2"><div className="text-xl font-bold text-destructive">{engine.failed}</div><div className="text-xs text-muted-foreground">Failed</div></div>
        <div className="rounded-md bg-muted p-2"><div className="text-xs font-semibold mt-1">{engine.lastSyncAt ? new Date(engine.lastSyncAt).toLocaleTimeString() : '—'}</div><div className="text-xs text-muted-foreground">Last upload</div></div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={online && engine.reachable ? 'default' : 'secondary'}>{online && engine.reachable ? 'Online' : 'Offline'}</Badge>
        {engine.lastError && <span className="text-xs text-destructive truncate">{engine.lastError}</span>}
      </div>
      {bills.length > 0 && <div className="max-h-56 overflow-y-auto divide-y rounded-md border">
        {bills.map((b, i) => <div key={b.id || i} className="flex justify-between gap-2 px-3 py-2">
          <span className="font-mono">#{b.bill_no}</span>
          <span className="text-muted-foreground text-xs">{new Date(b.created_at).toLocaleString()}</span>
          <span className="font-semibold">₹{Number(b.total_amount || 0).toFixed(2)}</span>
        </div>)}
      </div>}
      <div className="flex gap-2">
        <Button size="sm" onClick={syncNow} disabled={syncing || !online || bills.length === 0}><RefreshCw className={`h-4 w-4 mr-1 ${syncing ? 'animate-spin' : ''}`} />Upload now</Button>
        <Button size="sm" variant="outline" onClick={exportBackup} disabled={bills.length === 0}><Download className="h-4 w-4 mr-1" />Save backup file</Button>
      </div>
    </CardContent>
  </Card>;
}
