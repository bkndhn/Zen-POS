/**
 * 60-second device cache for the public online menu (stale-while-revalidate).
 * A repeat scan within 60s paints instantly from this cache; a fresh copy is
 * still fetched in the background so prices never stay stale for long.
 */
export const MENU_CACHE_TTL_MS = 60_000;

export interface CachedMenu<T = unknown> {
  savedAt: number;
  data: T;
}

const keyFor = (adminId: string, branchId: string | null) => `zp_menu_v1_${adminId}_${branchId ?? 'main'}`;

export function readMenuCache<T>(adminId: string, branchId: string | null, now = Date.now()): { data: T; fresh: boolean } | null {
  try {
    const raw = sessionStorage.getItem(keyFor(adminId, branchId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedMenu<T>;
    if (!parsed || typeof parsed.savedAt !== 'number') return null;
    return { data: parsed.data, fresh: now - parsed.savedAt < MENU_CACHE_TTL_MS };
  } catch {
    return null;
  }
}

export function writeMenuCache<T>(adminId: string, branchId: string | null, data: T, now = Date.now()) {
  try {
    sessionStorage.setItem(keyFor(adminId, branchId), JSON.stringify({ savedAt: now, data }));
  } catch {
    /* storage full / private mode — cache is optional */
  }
}
