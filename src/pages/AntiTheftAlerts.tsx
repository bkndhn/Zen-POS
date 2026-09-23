import React, { useEffect, useState, useCallback } from 'react';
import { Shield, AlertTriangle, CheckCircle2, Clock, Loader2, RefreshCw, Eye, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface AntiTheftAlert {
  id: string;
  alert_type: string;
  severity: string;
  bill_id: string | null;
  bill_no: string | null;
  amount: number | null;
  cashier_name: string | null;
  details: Record<string, any>;
  acknowledged: boolean;
  acknowledged_at: string | null;
  created_at: string;
  branches?: { name: string };
}

const ALERT_META: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  void_after_kot:  { label: 'Bill Voided After Service', icon: '🗑️', color: 'text-red-700',    bg: 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-900/50' },
  high_discount:   { label: 'High Discount Applied',     icon: '💸', color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/50' },
  bill_edit:       { label: 'Bill Edited After Billing', icon: '✏️', color: 'text-orange-700',  bg: 'bg-orange-50 border-orange-200 dark:bg-orange-950/30 dark:border-orange-900/50' },
  shift_variance:  { label: 'Cash Variance at Shift End', icon: '💰', color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200 dark:bg-purple-950/30 dark:border-purple-900/50' },
};

const SEVERITY_BADGE: Record<string, string> = {
  critical: 'bg-red-600 text-white',
  high:     'bg-orange-500 text-white',
  medium:   'bg-amber-400 text-white',
};

const AntiTheftAlerts: React.FC = () => {
  const { profile, adminProfileId } = useAuth();
  const [alerts, setAlerts] = useState<AntiTheftAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('unread');

  const load = useCallback(async () => {
    if (!adminProfileId) return;
    setLoading(true);
    const q = supabase
      .from('anti_theft_alerts')
      .select('*, branches(name)')
      .eq('admin_id', adminProfileId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (filter === 'unread') q.eq('acknowledged', false);
    const { data, error } = await q;
    if (!error && data) setAlerts(data as any);
    setLoading(false);
  }, [adminProfileId, filter]);

  useEffect(() => { void load(); }, [load]);

  // Real-time subscription
  useEffect(() => {
    if (!adminProfileId) return;
    const ch = supabase
      .channel('anti-theft-alerts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'anti_theft_alerts', filter: `admin_id=eq.${adminProfileId}` }, payload => {
        const meta = ALERT_META[(payload.new as any).alert_type] ?? { label: 'Alert', icon: '🚨' };
        toast.error(`${meta.icon} ${meta.label}`, {
          description: (payload.new as any).cashier_name ? `By ${(payload.new as any).cashier_name}` : undefined,
          duration: 8000,
        });
        setAlerts(prev => [payload.new as any, ...prev]);
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [adminProfileId]);

  const acknowledge = async (id: string) => {
    await supabase
      .from('anti_theft_alerts')
      .update({ acknowledged: true, acknowledged_by: profile?.user_id, acknowledged_at: new Date().toISOString() } as any)
      .eq('id', id);
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, acknowledged: true } : a));
  };

  const acknowledgeAll = async () => {
    const ids = alerts.filter(a => !a.acknowledged).map(a => a.id);
    if (!ids.length) return;
    await supabase
      .from('anti_theft_alerts')
      .update({ acknowledged: true, acknowledged_by: profile?.user_id, acknowledged_at: new Date().toISOString() } as any)
      .in('id', ids);
    setAlerts(prev => prev.map(a => ({ ...a, acknowledged: true })));
    toast.success('All alerts acknowledged');
  };

  const unreadCount = alerts.filter(a => !a.acknowledged).length;

  if (profile?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <ShieldAlert className="w-8 h-8 mr-2" />
        <p>Security alerts are only visible to admins.</p>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-red-600" />
          <h1 className="text-lg font-bold">Anti-Theft Alerts</h1>
          {unreadCount > 0 && (
            <Badge className="bg-red-600 text-white text-[10px]">{unreadCount} NEW</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading} className="gap-1.5">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </Button>
          {unreadCount > 0 && (
            <Button size="sm" variant="outline" onClick={() => void acknowledgeAll()} className="gap-1.5 text-green-700 border-green-300">
              <CheckCircle2 className="w-3.5 h-3.5" /> Mark all read
            </Button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(['unread', 'all'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
              filter === f
                ? 'bg-foreground text-background'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {f === 'unread' ? 'Unread' : 'All alerts'}
          </button>
        ))}
      </div>

      {/* Alert list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : alerts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Shield className="w-10 h-10 mx-auto mb-3 text-green-500" />
            <p className="font-medium text-green-700">All clear!</p>
            <p className="text-sm text-muted-foreground mt-1">No suspicious activity detected.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {alerts.map(alert => {
            const meta = ALERT_META[alert.alert_type] ?? { label: alert.alert_type, icon: '🚨', color: 'text-foreground', bg: 'bg-muted border-border' };
            return (
              <div
                key={alert.id}
                className={`rounded-xl border p-3 space-y-2 transition-opacity ${meta.bg} ${alert.acknowledged ? 'opacity-50' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span className="text-base leading-none">{meta.icon}</span>
                    <span className={`text-sm font-semibold ${meta.color}`}>{meta.label}</span>
                    <Badge className={`text-[10px] uppercase ${SEVERITY_BADGE[alert.severity] ?? 'bg-muted text-muted-foreground'}`}>
                      {alert.severity}
                    </Badge>
                    {(alert as any).branches?.name && (
                      <span className="text-[10px] bg-white/60 dark:bg-black/20 px-2 py-0.5 rounded-full text-muted-foreground font-medium border">
                        {(alert as any).branches.name}
                      </span>
                    )}
                  </div>
                  {!alert.acknowledged && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[11px] shrink-0 text-green-700"
                      onClick={() => void acknowledge(alert.id)}
                    >
                      <Eye className="w-3 h-3 mr-1" /> Seen
                    </Button>
                  )}
                </div>

                <div className="space-y-1">
                  {alert.cashier_name && (
                    <p className="text-xs">
                      <span className="text-muted-foreground">Cashier: </span>
                      <span className="font-medium">{alert.cashier_name}</span>
                    </p>
                  )}
                  {alert.bill_no && (
                    <p className="text-xs">
                      <span className="text-muted-foreground">Bill: </span>
                      <span className="font-medium">#{alert.bill_no}</span>
                      {alert.amount != null && (
                        <span className="text-muted-foreground"> · Rs.{Math.round(alert.amount)}</span>
                      )}
                    </p>
                  )}
                  {/* Details */}
                  {alert.alert_type === 'high_discount' && alert.details?.discount_pct && (
                    <p className="text-xs text-muted-foreground">
                      {alert.details.discount_pct}% discount (Rs.{Math.round(alert.details.discount_amt ?? 0)}) applied
                    </p>
                  )}
                  {alert.alert_type === 'shift_variance' && alert.details?.variance && (
                    <p className="text-xs text-muted-foreground">
                      Expected Rs.{Math.round(alert.details.expected)} · Got Rs.{Math.round(alert.details.actual)} · Diff Rs.{Math.round(alert.details.variance)}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                  {alert.acknowledged && alert.acknowledged_at && (
                    <span className="ml-2 text-green-600 font-medium">· Acknowledged</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AntiTheftAlerts;
