import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readMenuCache, writeMenuCache, MENU_CACHE_TTL_MS } from '@/utils/menuCache';

describe('public menu cache', () => {
  let values: Map<string, string>;
  beforeEach(() => {
    values = new Map();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('expires exactly after the requested 60 seconds', () => {
    writeMenuCache('shop-a', null, { items: [] }, 1000);
    expect(MENU_CACHE_TTL_MS).toBe(60_000);
    expect(readMenuCache('shop-a', null, 60_999)?.fresh).toBe(true);
    expect(readMenuCache('shop-a', null, 61_000)?.fresh).toBe(false);
  });
  it('keeps each shop and branch cache separate', () => {
    writeMenuCache('shop-a', 'branch-a', { items: ['tea'] }, 1000);
    expect(readMenuCache('shop-b', 'branch-a', 1001)).toBeNull();
    expect(readMenuCache('shop-a', 'branch-b', 1001)).toBeNull();
    expect(readMenuCache('shop-a', 'branch-a', 1001)?.data).toEqual({ items: ['tea'] });
  });
  it('rejects corrupt or future-dated entries', () => {
    values.set('zp_menu_v1_shop-a_main', '{broken');
    expect(readMenuCache('shop-a', null, 1000)).toBeNull();
    writeMenuCache('shop-a', null, { items: [] }, 2000);
    expect(readMenuCache('shop-a', null, 1000)).toBeNull();
  });
  it('allows menu loading when browser storage is unavailable', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => { throw new Error('Storage blocked'); },
      setItem: () => { throw new Error('Storage blocked'); },
    });
    expect(() => writeMenuCache('shop-a', null, { items: [] })).not.toThrow();
    expect(readMenuCache('shop-a', null)).toBeNull();
  });
});