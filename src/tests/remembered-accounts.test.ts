import { describe, it, expect } from 'vitest';
import { loadAccounts, rememberAccount, forgetAccount, MAX_REMEMBERED } from '@/utils/rememberedAccounts';

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }; };

describe('remembered sign-in accounts', () => {
  it('keeps at most 5, newest first, no duplicates', () => {
    const s = mem();
    for (let i = 0; i < 7; i++) rememberAccount(`u${i}@x.com`, s, undefined, i);
    rememberAccount('U3@X.com', s, undefined, 100);
    const list = loadAccounts(s);
    expect(list.length).toBe(MAX_REMEMBERED);
    expect(list[0].email).toBe('u3@x.com');
    expect(list.filter(a => a.email === 'u3@x.com').length).toBe(1);
  });
  it('removes an account', () => {
    const s = mem();
    rememberAccount('a@x.com', s); rememberAccount('b@x.com', s);
    expect(forgetAccount('a@x.com', s).map(a => a.email)).toEqual(['b@x.com']);
  });
  it('migrates the old single saved email', () => {
    const s = mem();
    s.setItem('hotel_pos_saved_email', btoa(encodeURIComponent('old@x.com')));
    expect(loadAccounts(s).map(a => a.email)).toEqual(['old@x.com']);
    expect(s.getItem('hotel_pos_saved_email')).toBeNull();
  });
});
