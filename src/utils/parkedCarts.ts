import { safeLocalStorage } from '@/utils/safeStorage';

export const PARKED_KEY = 'zenpos_parked_carts';
const LEGACY_KEY = 'hotel_pos_held_bill';
export const MAX_PARKED = 10;

export interface ParkedCart<T = any> {
  id: string;
  items: T[];
  note: string;
  total: number;
  parkedAt: number;
}

export function cartTotal(items: Array<{ price?: number; quantity?: number }>): number {
  return Math.round(items.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 0), 0) * 100) / 100;
}

export function addParked<T>(list: ParkedCart<T>[], items: T[], note: string, now = Date.now()): ParkedCart<T>[] {
  const live = (items as any[]).filter((i) => (i?.quantity ?? 0) > 0) as T[];
  if (live.length === 0) return list;
  const entry: ParkedCart<T> = {
    id: `${now}-${Math.random().toString(36).slice(2, 7)}`,
    items: live,
    note: note.trim().slice(0, 40),
    total: cartTotal(live as any),
    parkedAt: now,
  };
  return [entry, ...list].slice(0, MAX_PARKED);
}

export function removeParked<T>(list: ParkedCart<T>[], id: string): ParkedCart<T>[] {
  return list.filter((p) => p.id !== id);
}

export function loadParked(): ParkedCart[] {
  try {
    const raw = safeLocalStorage.getItem(PARKED_KEY);
    let list: ParkedCart[] = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) list = [];
    const legacy = safeLocalStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const items = JSON.parse(legacy);
      if (Array.isArray(items) && items.length) list = addParked(list, items, 'Held bill');
      safeLocalStorage.removeItem(LEGACY_KEY);
      saveParked(list);
    }
    return list;
  } catch {
    return [];
  }
}

export function saveParked(list: ParkedCart[]) {
  safeLocalStorage.setItem(PARKED_KEY, JSON.stringify(list));
}

export function minutesAgo(ts: number, now = Date.now()): string {
  const m = Math.floor((now - ts) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  return `${Math.floor(m / 60)} h ago`;
}
