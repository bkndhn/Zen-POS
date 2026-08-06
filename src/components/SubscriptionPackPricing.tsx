import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Tags, RefreshCw, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PRESET_SUBSCRIPTION_PLANS, calculatePlanPricing, type PackPricingOverride } from '@/utils/subscriptionPlans';

interface AdminOption {
  profile_id: string;
  name: string;
  hotel_name?: string | null;
  email?: string | null;
  subscription_amount?: number | null;
}

interface BranchOption {
  id: string;
  name: string;
  is_main?: boolean;
}

/** Packs eligible for a custom price/discount — 3 months and above */
const PACK_MONTHS = PRESET_SUBSCRIPTION_PLANS.filter((p) => p.months >= 3).map((p) => p.months);

type DraftRow = { price: string; discount: string; active: boolean };

export const SubscriptionPackPricing: React.FC<{ admins: AdminOption[] }> = ({ admins }) => {
  const { toast } = useToast();
  const [adminId, setAdminId] = useState<string>('');
  const [branchId, setBranchId] = useState<string>(''); // '' = all branches (admin-wide default)
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [rows, setRows] = useState<PackPricingOverride[]>([]);
  const [draft, setDraft] = useState<Record<number, DraftRow>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedAdmin = useMemo(
    () => admins.find((a) => a.profile_id === adminId) || null,
    [admins, adminId]
  );
  const baseMonthly = selectedAdmin?.subscription_amount || 999;

  useEffect(() => {
    if (!adminId && admins.length > 0) setAdminId(admins[0].profile_id);
  }, [admins, adminId]);

  // Load branches + pricing rows for the selected admin
  useEffect(() => {
    if (!adminId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [{ data: branchData }, { data: priceData }] = await Promise.all([
          (supabase as any).from('branches').select('id, name, is_main').eq('admin_id', adminId).order('is_main', { ascending: false }),
          (supabase as any).from('subscription_pack_pricing').select('*').eq('admin_id', adminId),
        ]);
        if (cancelled) return;
        setBranches(branchData || []);
        setRows((priceData || []) as PackPricingOverride[]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminId]);

  // Rebuild the editable draft whenever the scope changes
  useEffect(() => {
    const next: Record<number, DraftRow> = {};
    PACK_MONTHS.forEach((months) => {
      const existing = rows.find(
        (r) => r.months === months && (r.branch_id || '') === branchId
      );
      const preset = PRESET_SUBSCRIPTION_PLANS.find((p) => p.months === months);
      next[months] = {
        price: existing?.price_per_month != null ? String(existing.price_per_month) : '',
        discount:
          existing?.discount_percentage != null
            ? String(existing.discount_percentage)
            : String(preset?.discountPercentage ?? 0),
        active: existing ? existing.is_active : false,
      };
    });
    setDraft(next);
  }, [rows, branchId]);

  const handleSave = async () => {
    if (!adminId) return;
    setSaving(true);
    try {
      const payload = PACK_MONTHS.map((months) => {
        const d = draft[months];
        return {
          admin_id: adminId,
          branch_id: branchId || null,
          months,
          price_per_month: d?.price ? Number(d.price) : null,
          discount_percentage: Math.min(90, Math.max(0, Number(d?.discount || 0))),
          is_active: !!d?.active,
        };
      });

      for (const row of payload) {
        const existing = rows.find(
          (r) => r.months === row.months && (r.branch_id || '') === (row.branch_id || '')
        );
        if (existing?.id) {
          const { error } = await (supabase as any)
            .from('subscription_pack_pricing')
            .update(row)
            .eq('id', existing.id);
          if (error) throw error;
        } else {
          const { error } = await (supabase as any).from('subscription_pack_pricing').insert(row);
          if (error) throw error;
        }
      }

      const { data: refreshed } = await (supabase as any)
        .from('subscription_pack_pricing')
        .select('*')
        .eq('admin_id', adminId);
      setRows((refreshed || []) as PackPricingOverride[]);

      toast({ title: 'Pack pricing saved', description: 'Client will see the updated packs on their renewal page.' });
    } catch (e: any) {
      toast({ title: 'Could not save pack pricing', description: e?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border border-slate-200 dark:border-slate-800/80 rounded-2xl shadow-sm">
      <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 border-b pb-4">
        <CardTitle className="text-sm sm:text-base flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
          <Tags className="w-4 h-4 text-primary" /> Pack Price &amp; Discount (3+ Months)
        </CardTitle>
        <CardDescription className="text-xs text-muted-foreground">
          Set a custom monthly rate and discount for each multi-month pack. Isolated per client, and optionally per branch.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 space-y-5">
        {/* Scope pickers */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold">Client</Label>
            <select
              value={adminId}
              onChange={(e) => setAdminId(e.target.value)}
              className="w-full h-9 text-xs rounded-md border border-input bg-background px-2 font-semibold"
            >
              {admins.map((a) => (
                <option key={a.profile_id} value={a.profile_id}>
                  {a.hotel_name || a.name} {a.email ? `— ${a.email}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold flex items-center gap-1.5">
              <Building2 className="w-3 h-3" /> Branch scope
            </Label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="w-full h-9 text-xs rounded-md border border-input bg-background px-2 font-semibold"
            >
              <option value="">All branches (account default)</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} {b.is_main ? '(Main)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="text-[11px] text-muted-foreground">
          Base monthly rate for this client: <strong>₹{baseMonthly.toLocaleString('en-IN')}</strong>. Leave the price blank to use it.
          A branch-specific pack always overrides the account default.
        </div>

        {/* Pack rows */}
        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-8 text-xs text-muted-foreground">Loading pack pricing…</div>
          ) : (
            PACK_MONTHS.map((months) => {
              const d = draft[months] || { price: '', discount: '0', active: false };
              const monthly = d.price ? Number(d.price) : baseMonthly;
              const preview = calculatePlanPricing(monthly, months, Number(d.discount || 0));
              const preset = PRESET_SUBSCRIPTION_PLANS.find((p) => p.months === months);
              return (
                <div
                  key={months}
                  className={cn(
                    'rounded-xl border p-3 sm:p-4 space-y-3 transition-colors',
                    d.active ? 'border-primary/40 bg-primary/5' : 'bg-white dark:bg-slate-900/50'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm">{preset?.name || `${months} Months`}</span>
                      {d.active && <Badge className="text-[10px] bg-primary/15 text-primary border-primary/30">Custom</Badge>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">Enable</span>
                      <Switch
                        checked={d.active}
                        onCheckedChange={(v) => setDraft((s) => ({ ...s, [months]: { ...d, active: v } }))}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Price / month (₹)</Label>
                      <Input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        placeholder={String(baseMonthly)}
                        value={d.price}
                        onChange={(e) => setDraft((s) => ({ ...s, [months]: { ...d, price: e.target.value } }))}
                        className="h-9 text-xs font-semibold"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Discount (%)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={90}
                        inputMode="numeric"
                        value={d.discount}
                        onChange={(e) => setDraft((s) => ({ ...s, [months]: { ...d, discount: e.target.value } }))}
                        className="h-9 text-xs font-semibold"
                      />
                    </div>
                    <div className="col-span-2 sm:col-span-1 space-y-1">
                      <Label className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Client pays</Label>
                      <div className="h-9 flex items-center rounded-md border bg-muted/40 px-2 text-xs font-bold">
                        ₹{preview.totalAmount.toLocaleString('en-IN')}
                        <span className="ml-1.5 font-medium text-muted-foreground">
                          (₹{preview.monthlyRate.toLocaleString('en-IN')}/mo)
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <Button onClick={handleSave} disabled={saving || loading || !adminId} className="h-9 font-bold gap-1.5">
          <RefreshCw className={cn('w-3.5 h-3.5', saving && 'animate-spin')} /> Save Pack Pricing
        </Button>
      </CardContent>
    </Card>
  );
};

export default SubscriptionPackPricing;
