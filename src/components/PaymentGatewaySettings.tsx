import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { CreditCard, Save, Loader2, Copy } from 'lucide-react';

type Provider = 'razorpay' | 'phonepe';

interface Creds {
  id?: string;
  provider: Provider;
  mode: 'test' | 'live';
  key_id: string;
  key_secret: string;
  webhook_secret: string;
  merchant_id: string;
  salt_key: string;
  salt_index: string;
  is_active: boolean;
}

const empty = (provider: Provider): Creds => ({
  provider,
  mode: 'test',
  key_id: '',
  key_secret: '',
  webhook_secret: '',
  merchant_id: '',
  salt_key: '',
  salt_index: '1',
  is_active: true,
});

export const PaymentGatewaySettings: React.FC = () => {
  const { profile } = useAuth() as any;
  const adminId: string | undefined = profile?.role === 'admin' ? profile?.user_id : profile?.admin_id;

  const [provider, setProvider] = useState<Provider>('razorpay');
  const [form, setForm] = useState<Creds>(empty('razorpay'));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const webhookUrl = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/payments-webhook`;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!adminId) return setLoading(false);
      setLoading(true);
      const { data } = await (supabase as any)
        .from('payment_gateway_credentials')
        .select('*')
        .eq('admin_id', adminId)
        .eq('provider', provider)
        .is('branch_id', null)
        .maybeSingle();
      if (cancelled) return;
      setForm(data ? { ...empty(provider), ...data } : empty(provider));
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [adminId, provider]);

  const set = (k: keyof Creds, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!adminId) return;
    if (provider === 'razorpay' && (!form.key_id.trim() || !form.key_secret.trim())) {
      return toast({ title: 'Key ID and Key Secret are required', variant: 'destructive' });
    }
    if (provider === 'phonepe' && (!form.merchant_id.trim() || !form.salt_key.trim())) {
      return toast({ title: 'Merchant ID and Salt Key are required', variant: 'destructive' });
    }
    setSaving(true);
    const payload = {
      admin_id: adminId,
      branch_id: null,
      provider,
      mode: form.mode,
      key_id: form.key_id.trim() || null,
      key_secret: form.key_secret.trim() || null,
      webhook_secret: form.webhook_secret.trim() || null,
      merchant_id: form.merchant_id.trim() || null,
      salt_key: form.salt_key.trim() || null,
      salt_index: form.salt_index.trim() || '1',
      is_active: form.is_active,
      is_default: true,
    };
    const { error } = form.id
      ? await (supabase as any).from('payment_gateway_credentials').update(payload).eq('id', form.id)
      : await (supabase as any).from('payment_gateway_credentials').insert(payload);
    setSaving(false);
    if (error) return toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    toast({ title: 'Payment gateway saved' });
  };

  if (!adminId) return null;

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CreditCard className="h-5 w-5 text-primary" />
          Payment Gateway (Auto-collect)
          {form.is_active && form.id && <Badge variant="secondary">Active</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Provider</Label>
            <Select value={provider} onValueChange={(v) => setProvider(v as Provider)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="razorpay">Razorpay / UPI</SelectItem>
                <SelectItem value="phonepe">PhonePe</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Mode</Label>
            <Select value={form.mode} onValueChange={(v) => set('mode', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="test">Test</SelectItem>
                <SelectItem value="live">Live</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading ? (
          <div className="h-24 rounded-xl bg-muted animate-pulse" />
        ) : provider === 'razorpay' ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Key ID</Label>
              <Input value={form.key_id} onChange={(e) => set('key_id', e.target.value)} placeholder="rzp_live_xxxxxxxx" />
            </div>
            <div className="space-y-1.5">
              <Label>Key Secret</Label>
              <Input type="password" value={form.key_secret} onChange={(e) => set('key_secret', e.target.value)} placeholder="••••••••" />
            </div>
            <div className="space-y-1.5">
              <Label>Webhook Secret</Label>
              <Input type="password" value={form.webhook_secret} onChange={(e) => set('webhook_secret', e.target.value)} placeholder="••••••••" />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Merchant ID</Label>
              <Input value={form.merchant_id} onChange={(e) => set('merchant_id', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Salt Key</Label>
              <Input type="password" value={form.salt_key} onChange={(e) => set('salt_key', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Salt Index</Label>
              <Input value={form.salt_index} onChange={(e) => set('salt_index', e.target.value)} />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between rounded-xl border p-3">
          <div>
            <p className="text-sm font-medium">Enable auto-collection</p>
            <p className="text-xs text-muted-foreground">Charge customers and subscriptions online.</p>
          </div>
          <Switch checked={form.is_active} onCheckedChange={(v) => set('is_active', v)} />
        </div>

        <div className="rounded-xl bg-muted/50 p-3 space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Webhook URL (paste in provider dashboard)</p>
          <div className="flex items-center gap-2">
            <code className="text-[11px] break-all flex-1">{webhookUrl}</code>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0"
              onClick={() => { navigator.clipboard.writeText(webhookUrl); toast({ title: 'Webhook URL copied' }); }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full gap-2 h-11">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Gateway Settings
        </Button>
      </CardContent>
    </Card>
  );
};
