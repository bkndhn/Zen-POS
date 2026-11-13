import { useEffect, useState, useCallback } from 'react';
import { Monitor, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { counterConnectionState } from '@/utils/counterConnection';

type Connection = { id: string; device_id: string; device_label: string; last_seen_at: string };
export function CounterConnections() {
  const { profile, adminProfileId } = useAuth();
  const [rows, setRows] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const refresh = useCallback(async () => {
    if (profile?.role !== 'admin' || !adminProfileId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.from('counter_connections')
        .select('id,device_id,device_label,last_seen_at').eq('admin_id', adminProfileId)
        .order('last_seen_at', { ascending: false }).limit(100);
      setError(Boolean(error));
      if (!error) setRows(data || []);
    } catch { setError(true); }
    finally { setLoading(false); }
  }, [profile?.role, adminProfileId]);
  useEffect(() => {
    setRows([]);
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) void refresh();
    }, 60_000);
    return () => clearInterval(timer);
  }, [refresh]);
  if (profile?.role !== 'admin') return null;
  return <section className="space-y-3 border-t pt-4">
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold flex items-center gap-2"><Monitor className="h-4 w-4" />Counter connections</h2>
      <Button variant="ghost" size="icon" aria-label="Refresh counter connections" title="Refresh counter connections" disabled={loading} onClick={() => void refresh()}><RefreshCw className="h-4 w-4" /></Button>
    </div>
    {error ? <p className="text-sm text-destructive">Connection status unavailable. Try again when online.</p> : rows.length === 0 ? <p className="text-sm text-muted-foreground">{loading ? 'Checking counters…' : 'No counters seen yet.'}</p> :
      <ul className="divide-y">{rows.map(row => <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
        <div className="min-w-0"><p className="text-sm font-medium break-words">{row.device_label} · {row.device_id.slice(0, 8)}</p><p className="text-xs text-muted-foreground">Last seen {new Date(row.last_seen_at).toLocaleString()}</p></div>
        <span className={counterConnectionState(row.last_seen_at) === 'connected' ? 'text-sm text-success' : 'text-sm text-muted-foreground'}>{counterConnectionState(row.last_seen_at) === 'connected' ? 'Recently connected' : 'Not recently seen'}</span>
      </li>)}</ul>}
  </section>;
}