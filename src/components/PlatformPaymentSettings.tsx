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
import {
  CreditCard, Save, Loader2, Copy, ShieldCheck, RefreshCw, FlaskConical, CheckCircle2, XCircle,
} from 'lucide-react';

type Provider = 'razorpay' | 'phonepe';
type Mode = 'test' | 'live';

interface PlatformCreds {
  id?: string;
  provider: Provider;
  mode: Mode;
  key_id: string;
  key_secret: string;
  webhook_secret: string;
  merchant_id: string;
  salt_key: string;
  salt_index: string;
  is_active: boolean;
}

const empty = (provider: Provider, mode: Mode): PlatformCreds => ({
  provider,
  mode,
  key_id: '',
  key_secret: '',
  webhook_secret: '',
  merchant_id: '',
  salt_key: '',
  salt_index: '1',
  is_active: true,
});

interface CheckRow { step: string; ok: boolean; detail?: string }

export const PlatformPaymentSettings: React.FC = () => {
  const [provider, setProvider] = useState<Provider>('razorpay');
  const [mode, setMode] = useState<Mode>('test');
  const [form, setForm] = useState<PlatformCreds>(empty('razorpay', 'test'));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [checks, setChecks] = useState<CheckRow[] | null>(null);
  const [events, setEvents] = useState<any[]>([]);

  const webhookUrl = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/payments-webhook?provider=${provider}&scope=platform`;

  const loadEvents = async () => {
    const { data } = await (supabase as any)
      .from('payment_webhook_events')
      .select('id, provider, event_type, status, attempts, last_error, created_at')
      .order('created_at', { ascending: false })
      .limit(10);
    setEvents(data || []);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await (supabase as any)
        .from('payment_platform_credentials')
        .select('*')
        .eq('provider', provider)
        .eq('mode', mode)
        .maybeSingle();
      if (cancelled) return;
      setForm(data ? { ...empty(provider, mode), ...data } : empty(provider, mode));
      setLoading(false);
    })();
    loadEvents();
    return () => { cancelled = true; };
  }, [provider, mode]);

  const set = (k: keyof PlatformCreds, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (provider === 'razorpay' && (!form.key_id.trim() || !form.key_secret.trim())) {
      return toast({ title: 'Key ID and Key Secret are required', variant: 'destructive' });
    }
    if (provider === 'phonepe' && (!form.merchant_id.trim() || !form.salt_key.trim())) {
      return toast({ title: 'Merchant ID and Salt Key are required', variant: 'destructive' });
    }
    setSaving(true);
    const payload = {
      provider,
      mode,
      key_id: form.key_id.trim() || null,
      key_secret: form.key_secret.trim() || null,
      webhook_secret: form.webhook_secret.trim() || null,
      merchant_id: form.merchant_id.trim() || null,
      salt_key: form.salt_key.trim() || null,
      salt_index: form.salt_index.trim() || '1',
      is_active: form.is_active,
    };
    const { error } = form.id
      ? await (supabase as any).from('payment_platform_credentials').update(payload).eq('id', form.id)
      : await (supabase as any).from('payment_platform_credentials').insert(payload);
    setSaving(false);
    if (error) return toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    toast({ title: `Platform ${provider} (${mode}) saved` });
  };

  const runSandbox = async (outcome: 'success' | 'failure' | 'duplicate') => {
    setTesting(true);
    setChecks(null);
    try {
      const { data, error } = await supabase.functions.invoke('payments-sandbox-test', {
        body: { scope: 'platform', outcome },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setChecks((data as any)?.checks || []);
      loadEvents();
    } catch (e: any) {
      toast({ title: 'Sandbox test failed', description: e.message, variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  const runReconcile = async () => {
    setReconciling(true);
    try {
      const { data, error } = await supabase.functions.invoke('payments-reconcile', { body: {} });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const d = data as any;
      toast({
        title: 'Reconciliation complete',
        description: `Retried ${d.retried}, recovered ${d.recovered}, corrected ${d.reconciled}`,
      });
      loadEvents();
    } catch (e: any) {
      toast({ title: 'Reconcile failed', description: e.message, variant: 'destructive' });
    } finally {
      setReconciling(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Platform Gateway — collect subscriptions from clients
            <Badge variant={mode === 'live' ? 'default' : 'secondary'}>{mode === 'live' ? 'LIVE' : 'TEST'}</Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            These keys belong to you (the platform). They are completely separate from each client's own gateway keys,
            which they use to collect money from their customers.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Provider</Label>
              <Select value={provider} onValueChange={(v) => setProvider(v as Provider)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="razorpay">Razorpay / UPI Autopay</SelectItem>
                  <SelectItem value="phonepe">PhonePe</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Environment</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="test">Test / Sandbox</SelectItem>
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
                <Input value={form.key_id} onChange={(e) => set('key_id', e.target.value)} placeholder="rzp_test_xxxxxxxx" />
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
              <p className="text-sm font-medium">Active</p>
              <p className="text-xs text-muted-foreground">Use this configuration for subscription collection.</p>
            </div>
            <Switch checked={form.is_active} onCheckedChange={(v) => set('is_active', v)} />
          </div>

          <div className="rounded-xl bg-muted/50 p-3 space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Platform webhook URL (paste in provider dashboard)</p>
            <div className="flex items-center gap-2">
              <code className="text-[11px] break-all flex-1">{webhookUrl}</code>
              <Button variant="ghost" size="icon" className="shrink-0"
                onClick={() => { navigator.clipboard.writeText(webhookUrl); toast({ title: 'Webhook URL copied' }); }}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full gap-2 h-11">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Platform Gateway
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="h-5 w-5 text-primary" /> Sandbox testing
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Fires a signed test webhook at your own endpoint and verifies signature, settlement and duplicate protection.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <Button variant="outline" disabled={testing} onClick={() => runSandbox('success')}>Success</Button>
            <Button variant="outline" disabled={testing} onClick={() => runSandbox('failure')}>Failure</Button>
            <Button variant="outline" disabled={testing} onClick={() => runSandbox('duplicate')}>Duplicate</Button>
          </div>
          {testing && <div className="h-16 rounded-xl bg-muted animate-pulse" />}
          {checks && (
            <div className="space-y-1.5">
              {checks.map((c, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  {c.ok ? <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
                        : <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />}
                  <span className="flex-1">{c.step}
                    {c.detail && <span className="block text-[11px] text-muted-foreground break-all">{c.detail}</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
          <Button variant="secondary" className="w-full gap-2" disabled={reconciling} onClick={runReconcile}>
            {reconciling ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Reconcile now (retry failed webhooks)
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-5 w-5 text-primary" /> Recent webhook events
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {events.length === 0 && <p className="text-sm text-muted-foreground">No webhook events yet.</p>}
          {events.map((e) => (
            <div key={e.id} className="flex items-center justify-between rounded-xl border p-2.5 text-xs">
              <div className="min-w-0">
                <p className="font-medium truncate">{e.event_type || e.provider}</p>
                <p className="text-muted-foreground">{new Date(e.created_at).toLocaleString('en-IN')}</p>
                {e.last_error && <p className="text-destructive break-all">{e.last_error}</p>}
              </div>
              <Badge variant={e.status === 'processed' ? 'secondary' : e.status === 'failed' ? 'destructive' : 'outline'}>
                {e.status}{e.attempts > 1 ? ` ×${e.attempts}` : ''}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};
