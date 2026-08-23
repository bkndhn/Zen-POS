/**
 * Automated authorization tests.
 *
 * These run against the real Supabase project using the publishable (anon) key
 * and assert that Row Level Security and RPC grants deny access that should be denied.
 *
 * Optional signed-in coverage: set TEST_USER_EMAIL / TEST_USER_PASSWORD
 * (and optionally TEST_OTHER_ADMIN_ID) to also verify tenant isolation for a
 * real authenticated user. Without them, those tests are skipped.
 *
 * Run: bunx vitest run src/tests/authorization.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL as string;
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

const TEST_EMAIL = process.env.TEST_USER_EMAIL;
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD;
const OTHER_ADMIN_ID = process.env.TEST_OTHER_ADMIN_ID;

const makeClient = () =>
  createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

/** Tables that must never be readable by anonymous visitors. */
const TENANT_TABLES = [
  'profiles',
  'bills',
  'bill_items',
  'items',
  'customers',
  'expenses',
  'purchases',
  'suppliers',
  'user_permissions',
  'security_audit_log',
  'app_settings',
  'payment_settings',
  'payment_gateway_credentials',
  'shop_whatsapp_credentials',
  'subscription_payments',
  'recipes',
  'stock_ledger',
] as const;

/** RPCs that must reject anonymous callers. */
const PRIVILEGED_RPCS: Array<[string, Record<string, unknown>]> = [
  ['get_all_users_for_super_admin', {}],
  ['get_my_permissions', {}],
  ['get_my_security_epoch', {}],
  ['log_security_event', { p_event_type: 'auth', p_action: 'test' }],
  ['admin_purge_old_data', { p_days: 1 }],
];

const isDenied = (error: unknown, data: unknown) => {
  if (error) return true;
  // RLS with no matching policy returns an empty set rather than an error.
  return Array.isArray(data) ? data.length === 0 : data === null;
};

describe('authorization: anonymous access', () => {
  let anon: SupabaseClient;

  beforeAll(() => {
    expect(SUPABASE_URL, 'VITE_SUPABASE_URL must be set').toBeTruthy();
    expect(ANON_KEY, 'VITE_SUPABASE_PUBLISHABLE_KEY must be set').toBeTruthy();
    anon = makeClient();
  });

  it.each(TENANT_TABLES)('denies anonymous reads of %s', async (table) => {
    const { data, error } = await anon.from(table).select('*').limit(1);
    expect(
      isDenied(error, data),
      `anon unexpectedly read rows from ${table}`,
    ).toBe(true);
  });

  it.each(TENANT_TABLES)('denies anonymous writes to %s', async (table) => {
    const { error } = await anon.from(table).insert({} as never);
    expect(error, `anon unexpectedly wrote to ${table}`).toBeTruthy();
  });

  it.each(PRIVILEGED_RPCS)('denies anonymous call to %s', async (fn, args) => {
    const { data, error } = await anon.rpc(fn as never, args as never);
    expect(isDenied(error, data), `anon unexpectedly called ${fn}`).toBe(true);
  });

  it('allows only the explicitly public RPCs', async () => {
    const { error } = await anon.rpc('get_public_legal_content' as never, {} as never);
    expect(error).toBeFalsy();
  });
});

const authedDescribe = TEST_EMAIL && TEST_PASSWORD ? describe : describe.skip;

authedDescribe('authorization: authenticated tenant isolation', () => {
  let client: SupabaseClient;
  let myAdminId: string | null = null;
  let myRole: string | null = null;

  beforeAll(async () => {
    client = makeClient();
    const { error } = await client.auth.signInWithPassword({
      email: TEST_EMAIL as string,
      password: TEST_PASSWORD as string,
    });
    expect(error, 'test user sign-in failed').toBeFalsy();

    const { data } = await client.rpc('get_my_admin_id' as never, {} as never);
    myAdminId = (data as unknown as string) ?? null;
    const { data: role } = await client.rpc('get_my_role' as never, {} as never);
    myRole = (role as unknown as string) ?? null;
  });

  afterAll(async () => {
    await client?.auth.signOut();
  });

  it('resolves a tenant id for the signed-in user', () => {
    expect(myAdminId).toBeTruthy();
  });

  it('only returns rows belonging to the caller tenant', async () => {
    for (const table of ['bills', 'items', 'customers', 'expenses'] as const) {
      const { data, error } = await client.from(table).select('admin_id').limit(200);
      expect(error, `read of ${table} errored`).toBeFalsy();
      const foreign = (data || []).filter((r: any) => r.admin_id && r.admin_id !== myAdminId);
      expect(foreign.length, `${table} leaked rows from another tenant`).toBe(0);
    }
  });

  it('cannot read another tenant rows even when explicitly filtered', async () => {
    if (!OTHER_ADMIN_ID) return;
    const { data } = await client.from('bills').select('id').eq('admin_id', OTHER_ADMIN_ID).limit(1);
    expect((data || []).length).toBe(0);
  });

  it('cannot escalate its own role', async () => {
    const { data: me } = await client.from('profiles').select('id, role').limit(1).maybeSingle();
    if (!me) return;
    const { error } = await client
      .from('profiles')
      .update({ role: 'super_admin' })
      .eq('id', (me as any).id);
    const { data: after } = await client
      .from('profiles')
      .select('role')
      .eq('id', (me as any).id)
      .maybeSingle();
    expect(error || (after as any)?.role !== 'super_admin').toBeTruthy();
  });

  it('blocks super-admin-only RPCs for non-super-admins', async () => {
    if (myRole === 'super_admin') return;
    const { data, error } = await client.rpc('get_all_users_for_super_admin' as never, {} as never);
    expect(isDenied(error, data)).toBe(true);
  });

  it('writes an audit entry and can read back only its own tenant entries', async () => {
    const { error } = await client.rpc('log_security_event' as never, {
      p_event_type: 'auth',
      p_action: 'automated_authorization_test',
      p_severity: 'info',
    } as never);
    expect(error).toBeFalsy();

    const { data } = await client.from('security_audit_log').select('admin_id').limit(100);
    const foreign = (data || []).filter((r: any) => r.admin_id && r.admin_id !== myAdminId);
    expect(foreign.length).toBe(0);
  });
});
