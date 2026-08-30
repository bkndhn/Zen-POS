import React, { useState } from 'react';
import { Bell, BellOff, CheckCircle2, Loader2, AlertTriangle, ExternalLink, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { usePushNotifications } from '@/hooks/usePushNotifications';

/**
 * Device-level push registration panel.
 * Shown inside the Push Notifications settings card — works for both the
 * Android/iOS app (Capacitor) and the browser/PWA (Firebase Web FCM).
 */
export const PushNotificationDeviceCard: React.FC = () => {
  const { status, platform, gate, token, error, busy, description, enable, test, disable } =
    usePushNotifications();
  const [testing, setTesting] = useState(false);

  const registered = status === 'registered';
  const locked = status === 'locked';
  const off = status === 'disabled';

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

  return (
    <div className="rounded-xl border bg-muted/30 p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
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
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {registered
              ? 'Alerts will arrive even when this app is closed.'
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

      {gate && !gate.unlocked && (
        <p className="text-[11px] text-orange-600 font-medium">
          Super Admin has not unlocked push notifications for this account.
        </p>
      )}
    </div>
  );
};

export default PushNotificationDeviceCard;
