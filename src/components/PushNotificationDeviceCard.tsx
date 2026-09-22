import React, { useEffect, useState } from 'react';
import { Bell, BellOff, CheckCircle2, Loader2, AlertTriangle, ExternalLink, Send, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Device-level push registration panel.
 * Shown inside the Push Notifications settings card for all roles.
 * Supports: registration, mute per device, per-type preferences.
 */
export const PushNotificationDeviceCard: React.FC = () => {
  const { status, platform, gate, token, error, busy, description, enable, test, disable } =
    usePushNotifications();
  const { profile } = useAuth();
  const [testing, setTesting] = useState(false);
  const [muted, setMuted] = useState(false);
  const [muteSaving, setMuteSaving] = useState(false);

  // Per-type push preferences (admin can configure, sub-users see their own)
  const [prefs, setPrefs] = useState<Record<string, boolean>>({
    new_bill: true,
    live_bill: true,
    low_stock: true,
    new_remote_order: true,
    order_ready: true,
    service_request: true,
    khata_due: true,
    revenue_milestone: true,
    slow_day: true,
    daily_summary: true,
  });
  const [prefsSaving, setPrefsSaving] = useState(false);

  const registered = status === 'registered';
  const locked = status === 'locked';
  const off = status === 'disabled';

  // Load mute state and preferences from DB
  useEffect(() => {
    if (!profile?.user_id || !registered) return;
    const load = async () => {
      // Load device mute state
      const { data: dev } = await supabase
        .from('user_devices')
        .select('fcm_muted')
        .eq('user_id', profile.user_id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (dev) setMuted(dev.fcm_muted ?? false);

      // Load push preferences
      const { data: prof } = await supabase
        .from('profiles')
        .select('push_preferences')
        .eq('user_id', profile.user_id)
        .maybeSingle();
      if (prof?.push_preferences && typeof prof.push_preferences === 'object') {
        setPrefs(p => ({ ...p, ...prof.push_preferences as Record<string, boolean> }));
      }
    };
    void load();
  }, [profile?.user_id, registered]);

  const handleMuteToggle = async (val: boolean) => {
    if (!profile?.user_id) return;
    setMuteSaving(true);
    setMuted(val);
    await supabase
      .from('user_devices')
      .update({ fcm_muted: val } as any)
      .eq('user_id', profile.user_id);
    setMuteSaving(false);
    toast.success(val ? 'This device is muted — no notifications will arrive' : 'Device unmuted — notifications resumed');
  };

  const handlePrefChange = async (key: string, val: boolean) => {
    if (!profile?.user_id) return;
    const next = { ...prefs, [key]: val };
    setPrefs(next);
    setPrefsSaving(true);
    await supabase
      .from('profiles')
      .update({ push_preferences: next } as any)
      .eq('user_id', profile.user_id);
    setPrefsSaving(false);
  };

  const handleEnable = async () => {
    const next = await enable();
    if (next.status === 'registered') {
      toast.success('Notifications enabled on this device');
    } else {
      toast.error('Could not enable notifications', {
        description: describe(next.status, next.error),
      });
    }
  };

  const handleTest = async () => {
    setTesting(true);
    const res = await test();
    setTesting(false);
    res.ok
      ? toast.success('Test notification sent', { description: res.message })
      : toast.error('Test failed', { description: res.message });
  };

  const describe = (s: string, e?: string | null) =>
    s === 'locked'
      ? 'Push notifications are not unlocked for your account. Contact the Super Admin.'
      : s === 'disabled'
        ? 'Turn on "Enable Push Notifications" above and save settings first.'
        : description || e || '';

  const PREF_LABELS: Record<string, string> = {
    new_bill:          '🔔 New Order (Kitchen alert)',
    live_bill:         '💰 New Sale (Live bill alert)',
    low_stock:         '⚠️ Low Stock',
    new_remote_order:  '🛒 New Online Order',
    order_ready:       '✅ Order Ready',
    service_request:   '🛎️ Service Request',
    khata_due:         '💸 High Khata Dues',
    revenue_milestone: '🏆 Revenue Milestone',
    slow_day:          '😴 Slow Day Alert',
    daily_summary:     '📊 Daily Summary',
  };

  return (
    <div className="rounded-xl border bg-muted/30 p-3 space-y-3">
      {/* Device registration row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold">This device</span>
            <Badge variant="outline" className="text-[10px] uppercase">
              {platform === 'web' ? 'Browser / PWA' : platform}
            </Badge>
            {registered ? (
              <Badge className="bg-success text-success-foreground text-[10px] gap-1">
                <CheckCircle2 className="w-3 h-3" /> Active
              </Badge>
            ) : busy ? (
              <Badge variant="secondary" className="text-[10px] gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Checking
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px] gap-1">
                <AlertTriangle className="w-3 h-3" /> Not active
              </Badge>
            )}
            {registered && muted && (
              <Badge variant="destructive" className="text-[10px] gap-1">
                <VolumeX className="w-3 h-3" /> Muted
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {registered
              ? muted
                ? 'This device is muted. No notifications will arrive until you unmute.'
                : 'Alerts will arrive even when this app is closed.'
              : describe(status, error)}
          </p>
          {status === 'iframe' && (
            <a
              href={window.location.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary mt-1"
            >
              Open in a new tab <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {token && (
            <p className="text-[10px] text-muted-foreground/70 mt-1 font-mono break-all">
              ID: {token.slice(0, 18)}…
            </p>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        {!registered && (
          <Button size="sm" onClick={handleEnable} disabled={busy || locked || off} className="gap-1.5">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />}
            Enable on this device
          </Button>
        )}
        {registered && (
          <>
            <Button size="sm" variant="outline" onClick={handleTest} disabled={testing} className="gap-1.5">
              {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Send test
            </Button>
            {/* Device mute toggle */}
            <Button
              size="sm"
              variant={muted ? 'default' : 'ghost'}
              className={`gap-1.5 ${muted ? 'bg-orange-500 hover:bg-orange-600 text-white' : 'text-muted-foreground'}`}
              disabled={muteSaving}
              onClick={() => handleMuteToggle(!muted)}
            >
              {muteSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : muted ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              {muted ? 'Unmute device' : 'Mute device'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-muted-foreground"
              onClick={async () => {
                await disable();
                toast.success('This device will no longer receive notifications');
              }}
            >
              <BellOff className="w-3.5 h-3.5" /> Turn off here
            </Button>
          </>
        )}
      </div>

      {/* Per-type notification preferences (shown when registered and not muted) */}
      {registered && !muted && (
        <div className="pt-3 border-t space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Notification types</span>
            {prefsSaving && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            {Object.entries(PREF_LABELS).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between py-1">
                <Label className="text-xs font-normal cursor-pointer">{label}</Label>
                <Switch
                  checked={prefs[key] !== false}
                  onCheckedChange={val => void handlePrefChange(key, val)}
                  className="scale-90"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {gate && !gate.unlocked && (
        <p className="text-[11px] text-orange-600 font-medium">
          Super Admin has not unlocked push notifications for this account.
        </p>
      )}
    </div>
  );
};

export default PushNotificationDeviceCard;
