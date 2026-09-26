import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';

const EVENTS = [
  { id: 'bill.created', label: 'New bill created' },
  { id: 'bill.voided', label: 'Bill cancelled' },
  { id: 'payment.success', label: 'Payment successful' },
];

interface Endpoint {
  id: string;
  url: string;
  secret: string;
  events: string[];
  is_active: boolean;
  branch_id: string | null;
}

interface LogRow {
  id: string;
  event_type: string;
  status_code: number | null;
  success: boolean;
  duration_ms: number | null;
  created_at: string;
}

export const WebhookManager: React.FC = () => {
  const { profile, adminProfileId } = useAuth();
  const { operatingBranchId } = useBranch();
  const [endpoint, setEndpoint] = useState<Endpoint | null>(null);
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>(EVENTS.map((e) => e.id));
  const [active, setActive] = useState(true);
  const [showSecret, setShowSecret] = useState(false);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [busy, setBusy] = useState(false);

  const adminId = (profile?.role === 'admin' ? profile.id : adminProfileId) as string | undefined;

  const load = useCallback(async () => {
    if (!adminId) return;
    const { data } = await supabase
      .from('client_webhook_endpoints')
      .select('*')
      .eq('admin_id', adminId)
      .order('created_at', { ascending: true })
      .limit(1);
    const row = (data?.[0] as any) || null;
    if (row) {
      setEndpoint(row);
      setUrl(row.url);
      setEvents(row.events || []);
      setActive(row.is_active);
    }
    const { data: logRows } = await supabase
      .from('client_webhook_logs')
      .select('id, event_type, status_code, success, duration_ms, created_at')
      .eq('admin_id', adminId)
      .order('created_at', { ascending: false })
      .limit(10);
    setLogs((logRows as any) || []);
  }, [adminId]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!adminId) return;
    if (!/^https:\/\/.+/.test(url.trim())) {
      toast({ title: 'Invalid address', description: 'Enter a secure address starting with https://', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      if (endpoint) {
        const { error } = await supabase
          .from('client_webhook_endpoints')
          .update({ url: url.trim(), events, is_active: active })
          .eq('id', endpoint.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('client_webhook_endpoints').insert({
          admin_id: adminId,
          branch_id: operatingBranchId || null,
          url: url.trim(),
          events,
          is_active: active,
        });
        if (error) throw error;
      }
      toast({ title: 'Saved', description: 'Your webhook address is saved.' });
      await load();
    } catch (e: any) {
      toast({ title: 'Could not save', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const rotateSecret = async () => {
    if (!endpoint) return;
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const newSecret = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    const { error } = await supabase.from('client_webhook_endpoints').update({ secret: newSecret }).eq('id', endpoint.id);
    if (error) {
      toast({ title: 'Could not change key', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'New signing key created', description: 'Update it on your system.' });
    await load();
  };

  const sendTest = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('webhook-dispatch', {
        body: { event: 'test.ping', test: true, payload: { message: 'Hello from ZenPOS' } },
      });
      if (error) throw error;
      toast({ title: 'Test sent', description: `Delivered to ${(data as any)?.delivered ?? 0} address(es).` });
      await load();
    } catch (e: any) {
      toast({ title: 'Test failed', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  if (profile?.role !== 'admin') {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">Only the shop owner can set up webhooks.</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">🔔 Send my data to my own system</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Paste your own web address and we will send every new bill, cancelled bill and successful payment there instantly.
            </p>
          </div>
          <Switch checked={active} onCheckedChange={setActive} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Your address</Label>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-system.com/zenpos" />
        </div>

        <div className="space-y-2">
          <Label className="text-xs">What to send</Label>
          <div className="flex flex-wrap gap-3">
            {EVENTS.map((ev) => (
              <label key={ev.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={events.includes(ev.id)}
                  onCheckedChange={(c) =>
                    setEvents((prev) => (c ? [...new Set([...prev, ev.id])] : prev.filter((x) => x !== ev.id)))
                  }
                />
                {ev.label}
              </label>
            ))}
          </div>
        </div>

        {endpoint && (
          <div className="space-y-1.5">
            <Label className="text-xs">Signing key (keep private)</Label>
            <div className="flex flex-wrap items-center gap-2">
              <code className="text-xs bg-muted px-2 py-1 rounded break-all max-w-full">
                {showSecret ? endpoint.secret : '•'.repeat(24)}
              </code>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowSecret((s) => !s)}>
                {showSecret ? 'Hide' : 'Show'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => {
                  navigator.clipboard.writeText(endpoint.secret);
                  toast({ title: 'Copied' });
                }}
              >
                Copy
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={rotateSecret}>
                New key
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Every message is signed in the header <code>X-ZenPOS-Signature</code> so your system can confirm it came from us.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={busy}>Save</Button>
          <Button variant="outline" onClick={sendTest} disabled={busy || !endpoint}>Send test</Button>
        </div>

        {logs.length > 0 && (
          <div className="space-y-2 pt-2 border-t">
            <Label className="text-xs">Recent deliveries</Label>
            <div className="space-y-1">
              {logs.map((l) => (
                <div key={l.id} className="flex items-center justify-between text-xs py-1">
                  <span className="truncate">{l.event_type}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-muted-foreground">{l.duration_ms ?? 0} ms</span>
                    <Badge variant={l.success ? 'default' : 'destructive'} className="text-[10px]">
                      {l.status_code ?? 'failed'}
                    </Badge>
                    <span className="text-muted-foreground">{new Date(l.created_at).toLocaleTimeString()}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default WebhookManager;
