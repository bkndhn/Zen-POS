import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';

interface AntiTheftState {
  antitheft_enabled: boolean;
  antitheft_void_after_kot: boolean;
  antitheft_kot_item_delete: boolean;
  antitheft_cash_drawer: boolean;
  antitheft_high_discount: boolean;
  antitheft_discount_threshold_pct: number;
  antitheft_discount_threshold_amt: number;
  antitheft_bill_edit: boolean;
  antitheft_shift_variance: boolean;
  antitheft_shift_variance_amt: number;
}

const DEFAULTS: AntiTheftState = {
  antitheft_enabled: true,
  antitheft_void_after_kot: true,
  antitheft_kot_item_delete: true,
  antitheft_cash_drawer: true,
  antitheft_high_discount: true,
  antitheft_discount_threshold_pct: 15,
  antitheft_discount_threshold_amt: 200,
  antitheft_bill_edit: true,
  antitheft_shift_variance: true,
  antitheft_shift_variance_amt: 100,
};

export const SecurityAlertsSettings: React.FC = () => {
  const { profile } = useAuth();
  const { operatingBranchId } = useBranch();
  const navigate = useNavigate();
  const [adminUid, setAdminUid] = useState<string | null>(null);
  const [state, setState] = useState<AntiTheftState>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!profile) return;
      let uid = profile.user_id as string | null;
      if (profile.role !== 'admin' && (profile as any).admin_id) {
        const { data } = await supabase
          .from('profiles')
          .select('user_id')
          .eq('id', (profile as any).admin_id)
          .maybeSingle();
        uid = (data as any)?.user_id ?? uid;
      }
      setAdminUid(uid);
      if (!uid) return;

      let query = supabase.from('shop_settings').select('*').eq('user_id', uid);
      if (operatingBranchId) query = query.eq('branch_id', operatingBranchId);
      const { data } = await query.maybeSingle();
      const row: any = data;
      if (row) {
        setState({
          antitheft_enabled: row.antitheft_enabled ?? true,
          antitheft_void_after_kot: row.antitheft_void_after_kot ?? true,
          antitheft_kot_item_delete: row.antitheft_kot_item_delete ?? true,
          antitheft_cash_drawer: row.antitheft_cash_drawer ?? true,
          antitheft_high_discount: row.antitheft_high_discount ?? true,
          antitheft_discount_threshold_pct: row.antitheft_discount_threshold_pct ?? 15,
          antitheft_discount_threshold_amt: row.antitheft_discount_threshold_amt ?? 200,
          antitheft_bill_edit: row.antitheft_bill_edit ?? true,
          antitheft_shift_variance: row.antitheft_shift_variance ?? true,
          antitheft_shift_variance_amt: row.antitheft_shift_variance_amt ?? 100,
        });
      }
      setLoading(false);
    };
    load().catch(() => setLoading(false));
  }, [profile, operatingBranchId]);

  const set = <K extends keyof AntiTheftState>(key: K, value: AntiTheftState[K]) =>
    setState((s) => ({ ...s, [key]: value }));

  const save = async () => {
    if (!adminUid) return;
    setSaving(true);
    try {
      const { data: existing } = await supabase
        .from('shop_settings')
        .select('id')
        .eq('user_id', adminUid)
        .eq('branch_id', operatingBranchId as string)
        .maybeSingle();

      if (existing?.id) {
        const { error } = await supabase.from('shop_settings').update(state as any).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('shop_settings')
          .insert({ ...(state as any), user_id: adminUid, branch_id: operatingBranchId });
        if (error) throw error;
      }
      toast({ title: 'Saved', description: 'Your alert settings are updated.' });
    } catch (e: any) {
      toast({ title: 'Could not save', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (profile?.role !== 'admin') {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          Only the shop owner can change alert settings.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-red-200 dark:border-red-900/40">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">🛡️ Security &amp; Alerts</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Your phone buzzes the moment staff cancels a bill, gives a big discount, removes a kitchen item,
              opens the cash drawer, or closes a shift short.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigate('/security')}>
              View Alerts
            </Button>
            <Switch
              checked={state.antitheft_enabled}
              onCheckedChange={(v) => set('antitheft_enabled', v)}
              disabled={loading}
            />
          </div>
        </div>
      </CardHeader>

      {state.antitheft_enabled && (
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border">
            <div>
              <p className="text-sm font-medium">🗑️ Bill cancelled after printing</p>
              <p className="text-xs text-muted-foreground mt-0.5">Alert when a printed or sent bill is cancelled</p>
            </div>
            <Switch checked={state.antitheft_void_after_kot} onCheckedChange={(v) => set('antitheft_void_after_kot', v)} />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border">
            <div>
              <p className="text-sm font-medium">🍽️ Item removed after kitchen order</p>
              <p className="text-xs text-muted-foreground mt-0.5">Alert when items are taken off a bill already sent to the kitchen</p>
            </div>
            <Switch checked={state.antitheft_kot_item_delete} onCheckedChange={(v) => set('antitheft_kot_item_delete', v)} />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border">
            <div>
              <p className="text-sm font-medium">💵 Cash drawer opened with no sale</p>
              <p className="text-xs text-muted-foreground mt-0.5">Alert when the drawer is opened without a bill</p>
            </div>
            <Switch checked={state.antitheft_cash_drawer} onCheckedChange={(v) => set('antitheft_cash_drawer', v)} />
          </div>

          <div className="flex items-start justify-between p-3 rounded-lg bg-muted/40 border">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">💸 Big discount given</p>
              <p className="text-xs text-muted-foreground mt-0.5">Alert when a discount crosses your limit</p>
              {state.antitheft_high_discount && (
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">Above</span>
                    <input
                      type="number"
                      className="w-16 h-7 text-xs border rounded px-2 bg-background"
                      value={state.antitheft_discount_threshold_pct}
                      onChange={(e) => set('antitheft_discount_threshold_pct', Number(e.target.value))}
                      min={5}
                      max={80}
                      step={5}
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                  <span className="text-xs text-muted-foreground">or</span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">Rs.</span>
                    <input
                      type="number"
                      className="w-20 h-7 text-xs border rounded px-2 bg-background"
                      value={state.antitheft_discount_threshold_amt}
                      onChange={(e) => set('antitheft_discount_threshold_amt', Number(e.target.value))}
                      min={50}
                      step={50}
                    />
                  </div>
                </div>
              )}
            </div>
            <Switch checked={state.antitheft_high_discount} onCheckedChange={(v) => set('antitheft_high_discount', v)} />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border">
            <div>
              <p className="text-sm font-medium">✏️ Bill changed after billing</p>
              <p className="text-xs text-muted-foreground mt-0.5">Alert when a finished bill's items or amount are edited</p>
            </div>
            <Switch checked={state.antitheft_bill_edit} onCheckedChange={(v) => set('antitheft_bill_edit', v)} />
          </div>

          <div className="flex items-start justify-between p-3 rounded-lg bg-muted/40 border">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">💰 Shift closed with cash difference</p>
              <p className="text-xs text-muted-foreground mt-0.5">Alert when closing cash doesn't match the expected amount</p>
              {state.antitheft_shift_variance && (
                <div className="flex items-center gap-1 mt-2">
                  <span className="text-xs text-muted-foreground">Difference above Rs.</span>
                  <input
                    type="number"
                    className="w-20 h-7 text-xs border rounded px-2 bg-background"
                    value={state.antitheft_shift_variance_amt}
                    onChange={(e) => set('antitheft_shift_variance_amt', Number(e.target.value))}
                    min={50}
                    step={50}
                  />
                </div>
              )}
            </div>
            <Switch checked={state.antitheft_shift_variance} onCheckedChange={(v) => set('antitheft_shift_variance', v)} />
          </div>
        </CardContent>
      )}

      <CardContent className="pt-0">
        <Button onClick={save} disabled={saving || loading} className="w-full sm:w-auto">
          {saving ? 'Saving...' : 'Save alert settings'}
        </Button>
      </CardContent>
    </Card>
  );
};

export default SecurityAlertsSettings;
