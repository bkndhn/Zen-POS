import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Activity, RefreshCw, Database, HardDrive, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TopTable {
  name: string;
  bytes: number;
  rows: number;
}

interface BackendHealth {
  db_bytes: number;
  db_size: string;
  free_tier_bytes: number;
  free_tier_pct_used: number;
  storage_bytes: number;
  storage_size: string;
  top_tables: TopTable[];
  generated_at: string;
}

const formatBytes = (bytes: number): string => {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'kB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

export const BackendHealthCard: React.FC = () => {
  const [health, setHealth] = useState<BackendHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('get_backend_health' as never);
      if (rpcError) throw rpcError;
      setHealth(data as unknown as BackendHealth);
    } catch (e: any) {
      setError(e?.message || 'Failed to load backend health');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pct = health?.free_tier_pct_used ?? 0;
  const status =
    pct >= 85 ? 'critical' : pct >= 70 ? 'warning' : 'healthy';

  return (
    <Card className="border border-slate-200 dark:border-slate-800/80 rounded-2xl shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm sm:text-base flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
            <Activity className="w-4 h-4 text-primary" /> Backend Health
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={load} disabled={loading} className="h-8 w-8" aria-label="Refresh backend health">
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          </Button>
        </div>
        <CardDescription className="text-xs text-muted-foreground">
          Supabase free-tier usage. Upgrade to Pro ($25/mo) when usage stays above 70%.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="p-3 rounded-xl border border-destructive/30 bg-destructive/5 text-xs text-destructive font-semibold">
            {error}
          </div>
        )}

        {!health && loading && (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
            ))}
          </div>
        )}

        {health && (
          <>
            <div className={cn(
              'flex items-center gap-2 p-3 rounded-xl border text-xs font-bold',
              status === 'healthy' && 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-400',
              status === 'warning' && 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-400',
              status === 'critical' && 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400',
            )}>
              {status === 'healthy' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              {status === 'healthy' && 'Healthy — plenty of free-tier headroom'}
              {status === 'warning' && 'Above 70% — plan the Pro upgrade'}
              {status === 'critical' && 'Above 85% — upgrade to Pro now'}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Database className="w-3.5 h-3.5" /> Database
                </span>
                <span>{health.db_size} / 500 MB ({pct}%)</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    status === 'healthy' && 'bg-emerald-500',
                    status === 'warning' && 'bg-amber-500',
                    status === 'critical' && 'bg-red-500',
                  )}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl border bg-slate-50 dark:bg-slate-950 text-xs font-bold">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <HardDrive className="w-3.5 h-3.5" /> File Storage
              </span>
              <span>{health.storage_size} / 1 GB</span>
            </div>

            <div className="space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Largest tables</p>
              <div className="rounded-xl border divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
                {health.top_tables.slice(0, 6).map((t) => (
                  <div key={t.name} className="flex items-center justify-between px-3 py-2 text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-300 truncate">{t.name}</span>
                    <span className="flex items-center gap-2 shrink-0">
                      <Badge variant="secondary" className="text-[9px] font-bold">{t.rows.toLocaleString()} rows</Badge>
                      <span className="font-mono font-bold text-muted-foreground">{formatBytes(t.bytes)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-[10px] text-muted-foreground">
              Updated {new Date(health.generated_at).toLocaleString()} · Diagnostics auto-pruned daily (RUM 30d, audit 90d, rate-limits 24h).
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
};
