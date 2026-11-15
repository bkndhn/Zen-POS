import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

describe('purchase PIN helper is not a public API', () => {
  let client: SupabaseClient;
  beforeAll(() => {
    const url = process.env.VITE_SUPABASE_URL;
    const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error('Supabase configuration is required');
    client = createClient(url, key, { auth: { persistSession: false } });
  });
  it('does not expose the protected PIN helper through public RPC', async () => {
    const { error } = await client.rpc('can_read_purchase_history', {
      p_admin_id: '00000000-0000-0000-0000-000000000000',
    });
    expect(error?.code).toBe('PGRST202');
  });
});