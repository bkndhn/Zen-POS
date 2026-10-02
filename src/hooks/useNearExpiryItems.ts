import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { daysUntilDate, NearExpiryInfo } from '@/utils/expiryPricing';

/**
 * Map of item_id -> soonest expiry (within `horizonDays`) among in-stock batches
 * and item-level use-by dates. Read-only; failures return an empty map so billing never breaks.
 */
export const useNearExpiryItems = (adminId: string | null | undefined, horizonDays = 7) => {
  const [map, setMap] = useState<Record<string, NearExpiryInfo>>({});

  useEffect(() => {
    if (!adminId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const h = new Date(); h.setDate(h.getDate() + horizonDays);
        const horizon = h.toISOString().slice(0, 10);
        const [b, i] = await Promise.all([
          supabase.from('item_batches').select('item_id, batch_number, expiry_date, stock_quantity')
            .eq('admin_id', adminId).gt('stock_quantity', 0).not('expiry_date', 'is', null).lte('expiry_date', horizon).limit(1000),
          (supabase as any).from('items').select('id, expiry_date')
            .eq('admin_id', adminId).not('expiry_date', 'is', null).lte('expiry_date', horizon).limit(1000),
        ]);
        const out: Record<string, NearExpiryInfo> = {};
        const put = (id: string | null, exp: string | null, qty: number, batch?: string) => {
          if (!id || !exp) return;
          const days = daysUntilDate(exp);
          const cur = out[id];
          if (!cur || days < cur.days) out[id] = { days, qty, batch };
          else if (days === cur.days) cur.qty += qty;
        };
        (b.data || []).forEach((r: any) => put(r.item_id, r.expiry_date, Number(r.stock_quantity || 0), r.batch_number));
        (i.data || []).forEach((r: any) => { if (!out[r.id]) put(r.id, r.expiry_date, 0); });
        if (!cancelled) setMap(out);
      } catch {
        if (!cancelled) setMap({});
      }
    };
    void load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(t); };
  }, [adminId, horizonDays]);

  return map;
};
