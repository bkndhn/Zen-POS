import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/** Staff-only strip of today's active online orders. RLS returns nothing when signed out. */
const LABEL: Record<string, string> = { pending: 'New', accepted: 'Accepted', preparing: 'Preparing', ready: 'Ready' };

export const PoleLiveOrders: React.FC = () => {
  const [orders, setOrders] = useState<any[]>([]);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const { data } = await (supabase as any).from('remote_orders')
        .select('id,order_number,status,order_type,created_at')
        .gte('created_at', start.toISOString())
        .in('status', ['pending', 'accepted', 'preparing', 'ready'])
        .order('created_at', { ascending: true }).limit(12);
      if (alive) setOrders(data || []);
    };
    load();
    const ch = supabase.channel(`pole-orders-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'remote_orders' }, () => load())
      .subscribe();
    const iv = setInterval(load, 30000);
    return () => { alive = false; clearInterval(iv); supabase.removeChannel(ch); };
  }, []);
  if (!orders.length) return null;
  return (
    <div className="shrink-0 flex gap-2 overflow-x-auto px-4 py-2 border-b border-white/10 bg-slate-900/80 text-white" data-testid="pole-live-orders">
      <span className="text-xs uppercase tracking-wider text-white/40 self-center shrink-0">Online</span>
      {orders.map(o => (
        <span key={o.id} className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${o.status === 'ready' ? 'bg-primary text-primary-foreground' : 'bg-white/10'}`}>
          #{String(o.order_number).slice(-4)} · {LABEL[o.status] || o.status}
        </span>
      ))}
    </div>
  );
};
