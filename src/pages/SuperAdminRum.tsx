import React, { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Activity, Gauge, WifiOff, Zap, AlertTriangle, RefreshCw, Database } from 'lucide-react';

interface RumRow {
  id: string;
  admin_id: string | null;
  user_id: string | null;
  metric_type: string;
  metric_name: string;
  value_ms: number | null;
  route: string | null;
  meta: any;
  user_agent: string | null;
  created_at: string;
}

interface AdminMeta {
  admin_id: string;
  name: string;
  shop_name: string | null;
  email: string | null;
}

const WINDOWS = [
  { label: '1h', ms: 60 * 60 * 1000 },
  { label: '24h', ms: 24 * 60 * 60 * 1000 },
  { label: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: '30d', ms: 30 * 24 * 60 * 60 * 1000 },
];

function pct(n: number, d: number) {
  if (!d) return 0;
  return Math.round((n / d) * 100);
}

function fmtMs(n: number | null | undefined) {
  if (n == null) return '—';
  if (n < 1000) return `${Math.round(n)} ms`;
  return `${(n / 1000).toFixed(2)} s`;
}

function percentile(arr: number[], p: number) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

export default function SuperAdminRum() {
  const { profile, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<RumRow[]>([]);
  const [adminMap, setAdminMap] = useState<Record<string, AdminMeta>>({});
  const [loading, setLoading] = useState(true);
  const [windowIdx, setWindowIdx] = useState(1); // 24h default

  const loadData = async () => {
    setLoading(true);
    try {
      const since = new Date(Date.now() - WINDOWS[windowIdx].ms).toISOString();
      const { data, error } = await supabase
        .from('rum_events')
        .select('*')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(5000);

      if (error) throw error;
      const list = (data as any as RumRow[]) || [];
      setRows(list);

      // Load admin display names
      const adminIds = Array.from(new Set(list.map((r) => r.admin_id).filter(Boolean))) as string[];
      if (adminIds.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('user_id, name, shop_name, email')
          .in('user_id', adminIds);
        const map: Record<string, AdminMeta> = {};
        (profs as any[])?.forEach((p) => {
          map[p.user_id] = {
            admin_id: p.user_id,
            name: p.name || 'Unknown',
            shop_name: p.shop_name,
            email: p.email,
          };
        });
        setAdminMap(map);
      } else {
        setAdminMap({});
      }
    } catch (e) {
      console.error('RUM load error', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (profile?.role === 'super_admin') void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.role, windowIdx]);

  const stats = useMemo(() => {
    const pageLoads = rows.filter((r) => r.metric_type === 'page_load' && r.value_ms != null).map((r) => Number(r.value_ms));
    const hits = rows.filter((r) => r.metric_type === 'cache_hit').length;
    const misses = rows.filter((r) => r.metric_type === 'cache_miss').length;
    const offline = rows.filter((r) => r.metric_type === 'offline_fallback').length;
    const errors = rows.filter((r) => r.metric_type === 'error').length;
    const slow = rows.filter((r) => r.metric_type === 'query_slow').length;

    return {
      total: rows.length,
      pageLoadP50: percentile(pageLoads, 50),
      pageLoadP95: percentile(pageLoads, 95),
      pageLoadCount: pageLoads.length,
      cacheHitRate: pct(hits, hits + misses),
      cacheHits: hits,
      cacheMisses: misses,
      offlineCount: offline,
      errorCount: errors,
      slowCount: slow,
      uniqueClients: new Set(rows.map((r) => r.admin_id).filter(Boolean)).size,
    };
  }, [rows]);

  const perClient = useMemo(() => {
    const map = new Map<string, { events: number; pageLoads: number[]; errors: number; offline: number; slow: number; hits: number; misses: number }>();
    for (const r of rows) {
      const key = r.admin_id || 'anonymous';
      const bucket = map.get(key) || { events: 0, pageLoads: [], errors: 0, offline: 0, slow: 0, hits: 0, misses: 0 };
      bucket.events += 1;
      if (r.metric_type === 'page_load' && r.value_ms != null) bucket.pageLoads.push(Number(r.value_ms));
      if (r.metric_type === 'error') bucket.errors += 1;
      if (r.metric_type === 'offline_fallback') bucket.offline += 1;
      if (r.metric_type === 'query_slow') bucket.slow += 1;
      if (r.metric_type === 'cache_hit') bucket.hits += 1;
      if (r.metric_type === 'cache_miss') bucket.misses += 1;
      map.set(key, bucket);
    }
    return Array.from(map.entries())
      .map(([admin_id, b]) => ({
        admin_id,
        meta: adminMap[admin_id],
        events: b.events,
        p50: percentile(b.pageLoads, 50),
        p95: percentile(b.pageLoads, 95),
        errors: b.errors,
        offline: b.offline,
        slow: b.slow,
        cacheRate: pct(b.hits, b.hits + b.misses),
      }))
      .sort((a, b) => b.events - a.events);
  }, [rows, adminMap]);

  const routeStats = useMemo(() => {
    const map = new Map<string, { count: number; loads: number[] }>();
    for (const r of rows) {
      if (r.metric_type !== 'page_load' || r.value_ms == null || !r.route) continue;
      const b = map.get(r.route) || { count: 0, loads: [] };
      b.count += 1;
      b.loads.push(Number(r.value_ms));
      map.set(r.route, b);
    }
    return Array.from(map.entries())
      .map(([route, b]) => ({ route, count: b.count, p50: percentile(b.loads, 50), p95: percentile(b.loads, 95) }))
      .sort((a, b) => b.p95 - a.p95)
      .slice(0, 15);
  }, [rows]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }
  if (!profile) return <Navigate to="/auth" replace />;
  if (profile.role !== 'super_admin') return <Navigate to="/billing" replace />;

  return (
    <div className="p-4 space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            Real-User Monitoring
          </h1>
          <p className="text-sm text-muted-foreground">Live app speed, cache, offline & error metrics per client.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border overflow-hidden">
            {WINDOWS.map((w, i) => (
              <button
                key={w.label}
                onClick={() => setWindowIdx(i)}
                className={`px-3 py-1.5 text-xs font-medium ${
                  i === windowIdx ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={loadData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Top KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={<Gauge className="h-4 w-4" />} label="Page load p50" value={fmtMs(stats.pageLoadP50)} sub={`p95 ${fmtMs(stats.pageLoadP95)}`} />
        <KpiCard icon={<Zap className="h-4 w-4" />} label="Cache hit rate" value={`${stats.cacheHitRate}%`} sub={`${stats.cacheHits} hit / ${stats.cacheMisses} miss`} />
        <KpiCard icon={<WifiOff className="h-4 w-4" />} label="Offline fallbacks" value={String(stats.offlineCount)} sub={`${stats.uniqueClients} clients`} />
        <KpiCard icon={<AlertTriangle className="h-4 w-4" />} label="Errors" value={String(stats.errorCount)} sub={`${stats.slowCount} slow queries`} />
      </div>

      {/* Per-client table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Database className="h-5 w-5" /> Per-client performance
          </CardTitle>
          <CardDescription>
            Ranked by activity. p50/p95 are page-load times observed on each client's devices.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead className="text-right">Events</TableHead>
                <TableHead className="text-right">p50</TableHead>
                <TableHead className="text-right">p95</TableHead>
                <TableHead className="text-right">Cache</TableHead>
                <TableHead className="text-right">Offline</TableHead>
                <TableHead className="text-right">Slow</TableHead>
                <TableHead className="text-right">Errors</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {perClient.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    {loading ? 'Loading…' : 'No RUM events in this window yet.'}
                  </TableCell>
                </TableRow>
              )}
              {perClient.map((c) => (
                <TableRow key={c.admin_id}>
                  <TableCell>
                    <div className="font-medium">{c.meta?.shop_name || c.meta?.name || c.admin_id.slice(0, 8)}</div>
                    <div className="text-xs text-muted-foreground">{c.meta?.email || c.admin_id.slice(0, 8) + '…'}</div>
                  </TableCell>
                  <TableCell className="text-right">{c.events}</TableCell>
                  <TableCell className="text-right">{fmtMs(c.p50)}</TableCell>
                  <TableCell className="text-right">
                    <span className={c.p95 > 4000 ? 'text-destructive font-medium' : ''}>{fmtMs(c.p95)}</span>
                  </TableCell>
                  <TableCell className="text-right">{c.cacheRate}%</TableCell>
                  <TableCell className="text-right">{c.offline}</TableCell>
                  <TableCell className="text-right">{c.slow}</TableCell>
                  <TableCell className="text-right">
                    {c.errors > 0 ? <Badge variant="destructive">{c.errors}</Badge> : c.errors}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Slowest routes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Slowest routes (bottlenecks)</CardTitle>
          <CardDescription>Routes ranked by p95 load time — investigate the top rows first.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Route</TableHead>
                <TableHead className="text-right">Samples</TableHead>
                <TableHead className="text-right">p50</TableHead>
                <TableHead className="text-right">p95</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {routeStats.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-6">No page-load samples yet.</TableCell>
                </TableRow>
              )}
              {routeStats.map((r) => (
                <TableRow key={r.route}>
                  <TableCell className="font-mono text-xs">{r.route}</TableCell>
                  <TableCell className="text-right">{r.count}</TableCell>
                  <TableCell className="text-right">{fmtMs(r.p50)}</TableCell>
                  <TableCell className="text-right">
                    <span className={r.p95 > 4000 ? 'text-destructive font-medium' : ''}>{fmtMs(r.p95)}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Recent errors */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent errors</CardTitle>
          <CardDescription>Latest 20 client-side errors captured in this window.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Message</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.filter((r) => r.metric_type === 'error').slice(0, 20).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs whitespace-nowrap">{new Date(r.created_at).toLocaleTimeString()}</TableCell>
                  <TableCell className="text-xs">
                    {(r.admin_id && adminMap[r.admin_id]?.shop_name) || r.admin_id?.slice(0, 8) || '—'}
                  </TableCell>
                  <TableCell className="text-xs font-mono">{r.metric_name}</TableCell>
                  <TableCell className="text-xs max-w-md truncate">{r.meta?.message || '—'}</TableCell>
                </TableRow>
              ))}
              {rows.filter((r) => r.metric_type === 'error').length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-6">No errors 🎉</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          {icon}
          {label}
        </div>
        <div className="text-2xl font-bold">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}
