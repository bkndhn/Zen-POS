// Device-local list of recently used sign-in emails (no passwords, ever).
const KEY = 'zenpos_remembered_accounts';
const LEGACY_KEY = 'hotel_pos_saved_email';
export const MAX_REMEMBERED = 5;

export interface RememberedAccount { email: string; lastUsed: number }

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const store = (): Store | null => { try { return window.localStorage; } catch { return null; } };

const norm = (e: string) => e.trim().toLowerCase();

export function loadAccounts(s: Store | null = store()): RememberedAccount[] {
  if (!s) return [];
  let list: RememberedAccount[] = [];
  try {
    const parsed = JSON.parse(s.getItem(KEY) || '[]');
    if (Array.isArray(parsed)) list = parsed.filter(a => a && typeof a.email === 'string' && a.email.includes('@'));
  } catch { /* ignore */ }
  const legacy = s.getItem(LEGACY_KEY);
  if (legacy) {
    let email = legacy;
    try { email = decodeURIComponent(atob(legacy)); } catch { /* plain */ }
    s.removeItem(LEGACY_KEY);
    if (email.includes('@')) list = rememberAccount(email, s, list, 0);
  }
  return list.sort((a, b) => b.lastUsed - a.lastUsed).slice(0, MAX_REMEMBERED);
}

export function rememberAccount(email: string, s: Store | null = store(), current?: RememberedAccount[], at = Date.now()): RememberedAccount[] {
  const e = norm(email);
  const base = (current ?? loadAccounts(s)).filter(a => norm(a.email) !== e);
  const next = [{ email: e, lastUsed: at }, ...base].sort((a, b) => b.lastUsed - a.lastUsed).slice(0, MAX_REMEMBERED);
  s?.setItem(KEY, JSON.stringify(next));
  return next;
}

export function forgetAccount(email: string, s: Store | null = store()): RememberedAccount[] {
  const next = loadAccounts(s).filter(a => norm(a.email) !== norm(email));
  s?.setItem(KEY, JSON.stringify(next));
  return next;
}

export const accountInitials = (email: string) => email.split('@')[0].replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase() || '?';
