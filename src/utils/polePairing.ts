/**
 * Customer pole display pairing.
 * Each till gets a random, unguessable code. The display listens on that code only,
 * so knowing a shop or branch id is not enough to watch someone's running cart.
 */
const KEY = 'zenpos_pole_pairing_token';

const randomToken = (): string => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
};

export const isValidPoleToken = (t: string | null | undefined): t is string =>
  !!t && /^[a-f0-9]{32}$/.test(t);

export const getPolePairingToken = (): string => {
  try {
    const existing = localStorage.getItem(KEY);
    if (isValidPoleToken(existing)) return existing;
    const fresh = randomToken();
    localStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    return randomToken();
  }
};

/** Generates a new code; any previously paired phone stops receiving updates. */
export const resetPolePairingToken = (): string => {
  const fresh = randomToken();
  try { localStorage.setItem(KEY, fresh); } catch { /* ignore */ }
  return fresh;
};

export const getPoleDisplayUrl = (): string =>
  `${window.location.origin}/display?mode=pole&pair=${getPolePairingToken()}`;
