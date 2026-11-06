import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
  phone: string;
  /** Called once with the saved name so the cashier doesn't retype it. */
  onFoundName?: (name: string) => void;
  duesThreshold?: number;
  /** Amount of this bill going on credit, to show the balance after billing. */
  khataThisBill?: number;
}

interface Found {
  name: string | null;
  visit_count: number | null;
  total_spent: number | null;
  current_balance: number | null;
  khata_balance: number | null;
  loyalty_points: number | null;
}

/** Shows visits, spend, loyalty and khata due for a 10-digit phone. Data is admin-scoped by RLS. */
export const CustomerQuickLookup: React.FC<Props> = ({ phone, onFoundName, duesThreshold = 1000, khataThisBill = 0 }) => {
  const { adminProfileId } = useAuth();
  const [found, setFound] = useState<Found | null>(null);
  const [favs, setFavs] = useState<string[]>([]);
  const digits = phone.replace(/\D/g, '').slice(-10);

  useEffect(() => {
    setFound(null); setFavs([]);
    if (digits.length !== 10 || !adminProfileId) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('customers')
        .select('name, visit_count, total_spent, current_balance, khata_balance, loyalty_points')
        .eq('admin_id', adminProfileId)
        .ilike('phone', `%${digits}`)
        .limit(1)
        .maybeSingle();
      if (cancelled || !data) return;
      setFound(data as Found);
      if (data.name) onFoundName?.(data.name);
      const { data: bills } = await supabase
        .from('bills')
        .select('bill_items(quantity, items(name))')
        .eq('admin_id', adminProfileId)
        .ilike('customer_phone', `%${digits}`)
        .order('created_at', { ascending: false })
        .limit(20);
      if (cancelled) return;
      const tally: Record<string, number> = {};
      (bills || []).forEach((b: any) => (b.bill_items || []).forEach((bi: any) => {
        const n = bi.items?.name; if (n) tally[n] = (tally[n] || 0) + Number(bi.quantity || 0);
      }));
      setFavs(Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([n]) => n));
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits, adminProfileId]);

  if (!found) return null;
  const due = Number(found.current_balance ?? found.khata_balance ?? 0);
  return (
    <div className="mt-1.5 rounded-md border border-border bg-card p-2 text-[11px] space-y-1">
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        <span>🔁 {found.visit_count || 0} visits</span>
        <span>₹{Number(found.total_spent || 0).toLocaleString('en-IN')} spent</span>
        {Number(found.loyalty_points || 0) > 0 && <span>⭐ {found.loyalty_points} pts</span>}
        <span className={due > 0 ? 'font-semibold text-destructive' : 'text-success'}>
          Khata due ₹{due.toLocaleString('en-IN')}
        </span>
      </div>
      {khataThisBill > 0 && (
        <div className="font-semibold">
          Previous ₹{due.toLocaleString('en-IN')} + this bill ₹{khataThisBill.toLocaleString('en-IN')} = ₹{(due + khataThisBill).toLocaleString('en-IN')} due
        </div>
      )}
      {favs.length > 0 && <div className="text-muted-foreground">Usually orders: {favs.join(', ')}</div>}
      {due >= duesThreshold && (
        <div className="font-semibold text-destructive">⚠ Dues above ₹{duesThreshold.toLocaleString('en-IN')} — collect before more credit</div>
      )}
    </div>
  );
};
