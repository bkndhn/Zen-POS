import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

describe('monthly bill archive: public access boundaries', () => {
  let client: SupabaseClient;

  beforeAll(() => {
    const url = process.env.VITE_SUPABASE_URL;
    const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error('Supabase configuration is required');
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  it.each(['bills_archive', 'bill_items_archive'])(
    'does not grant anonymous history reads from %s',
    async table => {
      const { error } = await client.from(table).select('id').limit(1);
      expect(error?.code).toBe('42501');
    },
  );

  it('does not expose maintenance counts to public customers', async () => {
    const { error } = await client.rpc('preview_bill_archive', { p_month: '2026-09-01' });
    expect(error?.code).toBe('42501');
  });

  // Safe even on a regression: this only prepares an empty monthly partition.
  it('does not permit public customers to prepare monthly storage', async () => {
    const { error } = await client.rpc('prepare_bill_archive_month', { p_month: '2026-11-01' });
    expect(error?.code).toBe('42501');
  });
});