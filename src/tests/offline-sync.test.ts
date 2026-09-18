import { describe, expect, it } from 'vitest';
import {
  STATUS_RANK,
  groupOrdersByTableSeat,
  mergeOrdersConflictSafe,
  shouldApplyStatusUpdate,
} from '@/utils/seatUtils';

describe('offline order merge and conflict safety', () => {
  it('never moves an order backwards in the kitchen flow', () => {
    expect(shouldApplyStatusUpdate('pending', 'preparing')).toBe(true);
    expect(shouldApplyStatusUpdate('ready', 'pending')).toBe(false);
    // Re-applying the same status is harmless (idempotent retry after a reconnect)
    expect(shouldApplyStatusUpdate('served', 'served')).toBe(true);
    expect(shouldApplyStatusUpdate('served', 'preparing')).toBe(false);
  });

  it('ranks every kitchen status in a strict order', () => {
    expect(STATUS_RANK['pending']).toBeLessThan(STATUS_RANK['preparing']);
    expect(STATUS_RANK['preparing']).toBeLessThan(STATUS_RANK['ready']);
    expect(STATUS_RANK['ready']).toBeLessThan(STATUS_RANK['served']);
  });

  it('keeps the newer version when the same order arrives twice', () => {
    const local = [
      { id: 'o1', status: 'preparing', updated_at: '2026-09-16T10:00:00Z' },
      { id: 'o2', status: 'pending', updated_at: '2026-09-16T10:00:00Z' },
    ];
    const incoming = { id: 'o1', status: 'ready', updated_at: '2026-09-16T10:05:00Z' };

    const merged = mergeOrdersConflictSafe(local, incoming);
    const o1 = merged.find((o) => o.id === 'o1');

    expect(merged.length).toBe(2);
    expect(o1?.status).toBe('ready');
  });

  it('ignores a stale update that arrives late after a reconnect', () => {
    const local = [{ id: 'o1', status: 'served', updated_at: '2026-09-16T10:10:00Z' }];
    const stale = { id: 'o1', status: 'preparing', updated_at: '2026-09-16T10:01:00Z' };

    const merged = mergeOrdersConflictSafe(local, stale);
    expect(merged.find((o) => o.id === 'o1')?.status).toBe('served');
  });

  it('groups queued orders by table and seat for the kitchen view', () => {
    const groups = groupOrdersByTableSeat([
      { id: '1', table_number: '5', seat_number: 1, status: 'pending' } as any,
      { id: '2', table_number: '5', seat_number: 2, status: 'pending' } as any,
      { id: '3', table_number: '7', status: 'pending' } as any,
    ]);

    expect(groups.length).toBe(2);
    const table5 = groups.find((g: any) => String(g.tableNumber) === '5');
    expect(table5).toBeTruthy();
  });
});

describe('offline queue identifiers', () => {
  it('creates unique ids for queued records', async () => {
    // Minimal browser stubs so the sync engine module can be imported in Node
    if (typeof (globalThis as any).window === 'undefined') {
      (globalThis as any).window = {
        addEventListener: () => {},
        removeEventListener: () => {},
      };
    }
    if (typeof (globalThis as any).document === 'undefined') {
      (globalThis as any).document = { addEventListener: () => {}, removeEventListener: () => {} };
    }
    if (typeof (globalThis as any).indexedDB === 'undefined') {
      (globalThis as any).indexedDB = { open: () => ({}) };
    }
    if (typeof (globalThis as any).location === 'undefined') {
      (globalThis as any).location = { href: 'http://localhost/', hostname: 'localhost', origin: 'http://localhost' };
      (globalThis as any).window.location = (globalThis as any).location;
    }
    if (typeof (globalThis as any).navigator === 'undefined') {
      (globalThis as any).navigator = { onLine: true, userAgent: 'node' };
    }
    if (typeof (globalThis as any).localStorage === 'undefined') {
      const store = new Map<string, string>();
      const mem = {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => void store.set(k, String(v)),
        removeItem: (k: string) => void store.delete(k),
        clear: () => store.clear(),
        key: (i: number) => Array.from(store.keys())[i] ?? null,
        get length() { return store.size; },
      };
      (globalThis as any).localStorage = mem;
      (globalThis as any).window.localStorage = mem;
    }
    const { newClientUuid } = await import('@/utils/syncEngine');
    const ids = new Set(Array.from({ length: 500 }, () => newClientUuid()));
    expect(ids.size).toBe(500);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f-]{20,}$/i);
    }
  });
});
