import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { COUNTER_HEARTBEAT_MS } from '@/utils/counterConnection';

export function useCounterConnection() {
  const { user, profile } = useAuth();
  useEffect(() => {
    if (!user || !profile || profile.status !== 'active' || profile.role === 'super_admin') return;
    let cancelled = false;
    let sending = false;
    let deviceId: string;
    try {
      const key = 'zenpos-counter-device-id';
      deviceId = localStorage.getItem(key) || crypto.randomUUID();
      localStorage.setItem(key, deviceId);
    } catch { return; }
    const label = /Android|iPhone|iPad/i.test(navigator.userAgent) ? 'Phone / tablet' : 'Desktop counter';
    const ping = async () => {
      if (cancelled || sending || !navigator.onLine || document.visibilityState !== 'visible') return;
      sending = true;
      try {
        const { error } = await supabase.rpc('report_counter_connection', { p_device_id: deviceId, p_device_label: label });
        if (error && import.meta.env.DEV) console.warn('Counter connection unavailable:', error.message);
      } catch { /* A failed heartbeat must never block billing. */ }
      finally { sending = false; }
    };
    void ping();
    const timer = setInterval(() => void ping(), COUNTER_HEARTBEAT_MS);
    const wake = () => void ping();
    window.addEventListener('online', wake);
    document.addEventListener('visibilitychange', wake);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('online', wake);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [user?.id, profile?.id, profile?.status, profile?.role]);
}