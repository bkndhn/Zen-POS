import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface LandingConfig {
  heroTitle: string;
  heroSubtitle: string;
  pilotDays: number;
  monthlyPrice: string;
  yearlyPrice: string;
  contactPhone: string;
  whatsappNumber: string;
  promoBannerText?: string | null;
}

export const DEFAULT_LANDING_CONFIG: LandingConfig = {
  heroTitle: 'Lightning POS & QR Ordering OS for Modern Food Businesses',
  heroSubtitle: 'No hardware needed. Works offline. Tamil & English. Start billing in 2 minutes — from your phone or tablet.',
  pilotDays: 7,
  monthlyPrice: '1,000',
  yearlyPrice: '10,000',
  contactPhone: '9894451420',
  whatsappNumber: '919894451420',
  promoBannerText: null,
};

const EVENT = 'zenpos:landing-config-updated';
let cache: LandingConfig | null = null;

/** Notify all open landing views that the Super Admin saved new settings. */
export const notifyLandingConfigUpdated = () => {
  cache = null;
  window.dispatchEvent(new Event(EVENT));
};

/** Parse a price like "1,000" into a number. */
export const priceToNumber = (p: string | number) => Number(String(p).replace(/[^0-9.]/g, '')) || 0;

const load = async (): Promise<LandingConfig> => {
  const { data } = await (supabase.rpc as any)('get_public_landing_config');
  const merged = { ...DEFAULT_LANDING_CONFIG };
  if (data && typeof data === 'object') {
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      if (v !== null && v !== undefined && v !== '') (merged as any)[k] = v;
    }
    merged.pilotDays = Number(merged.pilotDays) || DEFAULT_LANDING_CONFIG.pilotDays;
    merged.promoBannerText = (data as any).promoBannerText || null;
  }
  cache = merged;
  return merged;
};

export function useLandingConfig(): LandingConfig {
  const [config, setConfig] = useState<LandingConfig>(cache ?? DEFAULT_LANDING_CONFIG);

  useEffect(() => {
    let alive = true;
    const refresh = () => load().then((c) => alive && setConfig(c)).catch(() => {});
    refresh();
    const onFocus = () => document.visibilityState === 'visible' && refresh();
    window.addEventListener(EVENT, refresh);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      alive = false;
      window.removeEventListener(EVENT, refresh);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, []);

  return config;
}
