// Super-Admin control panel for AI Insights usage limits (per admin).
// Renders inside SuperAdminUsers page as an expandable row-action.
import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Sparkles, RotateCcw } from 'lucide-react';

interface Props { adminId: string | null; adminName?: string; onClose: () => void }

interface Limit {
  admin_id: string;
  enabled: boolean;
  period: 'daily' | 'weekly' | 'monthly' | 'lifetime';
  quota: number;
  used_count: number;
  lifetime_quota: number | null;
  lifetime_used: number;
}

export const SuperAdminAiLimits: React.FC<Props> = ({ adminId, adminName, onClose }) => {
  const [row, setRow] = useState<Limit | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!adminId) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from('ai_usage_limits').select('*').eq('admin_id', adminId).maybeSingle();
      setRow(data as any ?? {
        admin_id: adminId, enabled: true, period: 'monthly', quota: 30, used_count: 0,
        lifetime_quota: null, lifetime_used: 0,
      });
      setLoading(false);
    })();
  }, [adminId]);

  if (!adminId) return null;

  const save = async () => {
    if (!row) return;
    setSaving(true);
    const payload = {
      admin_id: adminId,
      enabled: row.enabled,
      period: row.period,
      quota: Number(row.quota) || 0,
      lifetime_quota: row.lifetime_quota == null || Number.isNaN(row.lifetime_quota) ? null : Number(row.lifetime_quota),
    };
    const { error } = await supabase.from('ai_usage_limits').upsert(payload, { onConflict: 'admin_id' });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success('AI limit saved');
    onClose();
  };

  const resetPeriod = async () => {
    const { error } = await supabase.from('ai_usage_limits')
      .update({ used_count: 0, period_started_at: new Date().toISOString() })
      .eq('admin_id', adminId);
    if (error) return toast.error(error.message);
    toast.success('Period usage reset');
    setRow(r => r ? { ...r, used_count: 0 } : r);
  };

  const resetLifetime = async () => {
    const { error } = await supabase.from('ai_usage_limits').update({ lifetime_used: 0 }).eq('admin_id', adminId);
    if (error) return toast.error(error.message);
    toast.success('Lifetime usage reset');
    setRow(r => r ? { ...r, lifetime_used: 0 } : r);
  };

  return (
    <Dialog open={!!adminId} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="w-4 h-4" /> AI Insights Limits</DialogTitle>
          <p className="text-xs text-muted-foreground">{adminName}</p>
        </DialogHeader>
        {loading || !row ? (
          <div className="text-sm text-muted-foreground py-6">Loading…</div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="font-medium text-sm">Enable AI Insights</div>
                <div className="text-xs text-muted-foreground">Paid add-on. Disabling blocks all AI calls.</div>
              </div>
              <Switch checked={row.enabled} onCheckedChange={v => setRow({ ...row, enabled: v })} />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Reset period</Label>
              <Select value={row.period} onValueChange={v => setRow({ ...row, period: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="lifetime">Lifetime (no auto-reset)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Quota per period</Label>
              <Input type="number" min={0} value={row.quota} onChange={e => setRow({ ...row, quota: Number(e.target.value) })} />
              <div className="text-xs text-muted-foreground">Used this period: <strong>{row.used_count}</strong></div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Lifetime cap (optional)</Label>
              <Input
                type="number" min={0} placeholder="No lifetime cap"
                value={row.lifetime_quota ?? ''}
                onChange={e => setRow({ ...row, lifetime_quota: e.target.value === '' ? null : Number(e.target.value) })}
              />
              <div className="text-xs text-muted-foreground">Lifetime used: <strong>{row.lifetime_used}</strong></div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={resetPeriod}><RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset period usage</Button>
              <Button variant="outline" size="sm" onClick={resetLifetime}><RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset lifetime</Button>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default SuperAdminAiLimits;
