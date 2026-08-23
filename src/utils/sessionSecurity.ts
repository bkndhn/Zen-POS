import { supabase } from '@/integrations/supabase/client';
import { fetchSecurityEpoch, logSecurityEvent } from '@/utils/auditLog';
import { safeLocalStorage } from '@/utils/storageUtils';

const EPOCH_KEY = 'zp_security_epoch';
const SESSION_START_KEY = 'zp_session_started_at';

/** Absolute session lifetime: sessions older than this are revoked even if active. */
export const ABSOLUTE_SESSION_MAX_MS = 12 * 60 * 60 * 1000; // 12 hours

/** How often we re-verify role/permission epoch against the server. */
export const EPOCH_CHECK_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes

export const markSessionStart = (): void => {
  safeLocalStorage.setItem(SESSION_START_KEY, String(Date.now()));
};

export const clearSessionSecurityState = (): void => {
  safeLocalStorage.removeItem(EPOCH_KEY);
  safeLocalStorage.removeItem(SESSION_START_KEY);
};

export const isSessionExpiredByAge = (): boolean => {
  const started = Number(safeLocalStorage.getItem(SESSION_START_KEY) || 0);
  if (!started) return false;
  return Date.now() - started > ABSOLUTE_SESSION_MAX_MS;
};

export const storeSecurityEpoch = (epoch: number | null): void => {
  if (epoch === null) return;
  safeLocalStorage.setItem(EPOCH_KEY, String(epoch));
};

export const getStoredSecurityEpoch = (): number | null => {
  const raw = safeLocalStorage.getItem(EPOCH_KEY);
  return raw === null || raw === '' ? null : Number(raw);
};

/**
 * Returns true when the server epoch differs from the one captured at login,
 * meaning the user's role/status/tenant changed and the session must be revoked.
 */
export const hasSecurityEpochChanged = async (): Promise<boolean> => {
  const stored = getStoredSecurityEpoch();
  const current = await fetchSecurityEpoch();
  if (current === null) return false;
  if (stored === null) {
    storeSecurityEpoch(current);
    return false;
  }
  return current !== stored;
};

/** Signs the user out immediately, recording the reason in the audit trail. */
export const revokeSession = async (reason: string): Promise<void> => {
  await logSecurityEvent({
    eventType: 'session',
    action: 'session_revoked',
    severity: 'warning',
    details: { reason },
  });
  clearSessionSecurityState();
  try {
    await supabase.auth.signOut();
  } catch {
    /* ignore */
  }
};
