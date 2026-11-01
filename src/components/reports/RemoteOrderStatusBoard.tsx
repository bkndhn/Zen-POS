import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

const STAGES = ['pending', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'completed'] as const;
const LABEL: Record<string, string> = {
  pending: 'New', accepted: 'Accepted', preparing: 'Preparing', ready: 'Ready',
  out_for_delivery: 'On the way', completed: 'Completed', rejected: 'Rejected', cancelled: 'Cancelled',
};

const minsSince = (iso?: string | null) => (iso ? Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)) : 0);

export const RemoteOrderStatusBoard: React.FC = () => {
  const { adminProfileId } = useAuth();
  const { operatingBranchId } = useBranch();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [, tick] = useState(0);

  const load = useCallback(async () => {
    if (!adminProfileId) return;
    const since = new Date(); since.setHours(0, 0, 0, 0);
    let q = supabase.from('remote_orders')
      .select('id,order_number,customer_name,order_type,status,payment_method,payment_mode,is_paid,total_amount,created_at,accepted_at,ready_at,completed_at,estimated_prep_time')
      .eq('admin_id', adminProfileId)
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .limit(200);
    if (operatingBranchId) q = q.eq('branch_id', operatingBranchId);
    const { data } = await q;
    setOrders(data || []);
    setLoading(false);
  }, [adminProfileId, operatingBranchId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!adminProfileId) return;
    const ch = supabase
      .channel(`report-remote-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'remote_orders', filter: `admin_id=eq.${adminProfileId}` }, () => load())
      .subscribe();
    const t = setInterval(() => tick(n => n + 1), 30000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
  }, [adminProfileId, load]);

  const active = useMemo(() => orders.filter(o => !['completed', 'rejected', 'cancelled'].includes(o.status)), [orders]);
  const done = orders.length - active.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2 text-sm">
          <Badge variant="secondary">Live: {active.length}</Badge>
          <Badge variant="outline">Finished today: {done}</Badge>
        </div>
        <Button size="sm" variant="outline" onClick={load}><RefreshCw className="h-4 w-4 mr-1" />Refresh</Button>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : orders.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-muted-foreground">No online orders today</CardContent></Card>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {orders.map(o => {
            const idx = STAGES.indexOf(o.status);
            const late = idx >= 0 && idx < 3 && o.estimated_prep_time && minsSince(o.accepted_at || o.created_at) > o.estimated_prep_time;
            const pay = (o.payment_method || o.payment_mode || '').toString().toUpperCase();
            return (
              <Card key={o.id} className={late ? 'border-destructive' : ''}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">#{o.order_number}</span>
                    <Badge variant={o.status === 'rejected' ? 'destructive' : o.status === 'completed' ? 'secondary' : 'default'}>
                      {LABEL[o.status] || o.status}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground flex justify-between">
                    <span>{o.customer_name || 'Guest'} · {o.order_type}</span>
                    <span>₹{Number(o.total_amount || 0).toFixed(0)} · {pay}{o.is_paid ? ' ✓' : ''}</span>
                  </div>
                  {idx >= 0 && (
                    <div className="flex gap-1">
                      {STAGES.map((s, i) => (
                        <div key={s} title={LABEL[s]} className={`h-1.5 flex-1 rounded ${i <= idx ? 'bg-primary' : 'bg-muted'}`} />
                      ))}
                    </div>
                  )}
                  <div className={`text-xs ${late ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                    {o.status === 'completed' ? `Done in ${Math.round((new Date(o.completed_at || o.created_at).getTime() - new Date(o.created_at).getTime()) / 60000)} min`
                      : `${minsSince(o.created_at)} min since order${late ? ' · running late' : ''}`}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default RemoteOrderStatusBoard;
