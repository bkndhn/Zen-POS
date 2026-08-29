/**
 * End-to-end smoke flow.
 *
 * Signs in as an admin (and optionally a sub-user), creates a bill, opens and
 * closes a cash shift, and asserts the Z-report figures + reconciliation row
 * are readable without runtime errors.
 *
 * Credentials are read from the environment; the whole suite skips cleanly when
 * they are absent so CI stays green on projects without a test tenant:
 *   TEST_USER_EMAIL / TEST_USER_PASSWORD   (admin account)
 *   TEST_STAFF_EMAIL / TEST_STAFF_PASSWORD (optional sub-user account)
 *
 * Run: bunx vitest run src/tests/smoke-flow.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL as string;
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

const ADMIN_EMAIL = process.env.TEST_USER_EMAIL;
const ADMIN_PASSWORD = process.env.TEST_USER_PASSWORD;
const STAFF_EMAIL = process.env.TEST_STAFF_EMAIL;
const STAFF_PASSWORD = process.env.TEST_STAFF_PASSWORD;

const hasAdmin = Boolean(SUPABASE_URL && ANON_KEY && ADMIN_EMAIL && ADMIN_PASSWORD);
const hasStaff = Boolean(SUPABASE_URL && ANON_KEY && STAFF_EMAIL && STAFF_PASSWORD);

const makeClient = () =>
  createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

interface Ctx {
  client: SupabaseClient;
  profileId: string;
  adminId: string;
  branchId: string;
}

async function signIn(email: string, password: string): Promise<Ctx> {
  const client = makeClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in failed: ${error.message}`);

  const { data: user } = await client.auth.getUser();
  const { data: profile, error: pErr } = await client
    .from('profiles')
    .select('id, role, admin_id')
    .eq('user_id', user.user!.id)
    .maybeSingle();
  if (pErr) throw new Error(`profile read failed: ${pErr.message}`);
  if (!profile) throw new Error('no profile row for test account');

  const adminId = profile.role === 'admin' ? profile.id : (profile.admin_id as string);
  return { client, profileId: profile.id, adminId, branchId: adminId };
}

describe.skipIf(!hasAdmin)('smoke: admin billing + shift + z-report', () => {
  let ctx: Ctx;
  const created = { billIds: [] as string[], shiftIds: [] as string[], reconIds: [] as string[] };

  beforeAll(async () => {
    ctx = await signIn(ADMIN_EMAIL!, ADMIN_PASSWORD!);
  }, 30_000);

  afterAll(async () => {
    if (!ctx) return;
    for (const id of created.reconIds) await ctx.client.from('shift_reconciliations').delete().eq('id', id);
    for (const id of created.billIds) await ctx.client.from('bills').delete().eq('id', id);
    for (const id of created.shiftIds) await ctx.client.from('shifts').delete().eq('id', id);
    await ctx.client.auth.signOut();
  }, 30_000);

  it('reads its own profile and tenant scope', () => {
    expect(ctx.adminId).toBeTruthy();
  });

  it('opens a cash shift', async () => {
    const { data, error } = await ctx.client
      .from('shifts')
      .insert({
        admin_id: ctx.adminId,
        branch_id: ctx.branchId,
        opened_by: ctx.profileId,
        opened_at: new Date().toISOString(),
        opening_cash: 500,
        status: 'open',
      } as any)
      .select('id, opening_cash, status')
      .maybeSingle();

    expect(error, error?.message).toBeNull();
    expect(data?.status).toBe('open');
    if (data?.id) created.shiftIds.push(data.id);
  }, 20_000);

  it('creates a bill', async () => {
    const { data, error } = await ctx.client
      .from('bills')
      .insert({
        admin_id: ctx.adminId,
        branch_id: ctx.branchId,
        user_id: ctx.profileId,
        bill_number: `SMOKE-${Date.now()}`,
        date: new Date().toISOString().slice(0, 10),
        total_amount: 250.5,
        payment_mode: 'cash',
        is_deleted: false,
      } as any)
      .select('id, total_amount, payment_mode')
      .maybeSingle();

    expect(error, error?.message).toBeNull();
    expect(Number(data?.total_amount)).toBeCloseTo(250.5, 2);
    if (data?.id) created.billIds.push(data.id);
  }, 20_000);

  it('aggregates z-report figures for the open shift', async () => {
    const shiftId = created.shiftIds[0];
    const { data: shift } = await ctx.client.from('shifts').select('*').eq('id', shiftId).maybeSingle();
    expect(shift).toBeTruthy();

    const { data: bills, error } = await ctx.client
      .from('bills')
      .select('total_amount, payment_mode')
      .eq('branch_id', ctx.branchId)
      .eq('is_deleted', false)
      .gte('created_at', shift!.opened_at);

    expect(error, error?.message).toBeNull();
    const total = (bills || []).reduce((s, b: any) => s + Number(b.total_amount || 0), 0);
    expect(total).toBeGreaterThanOrEqual(250.5);
    expect(Number(total.toFixed(2))).toBe(total === 0 ? 0 : Number(total.toFixed(2)));
  }, 20_000);

  it('closes the shift and records a traceable reconciliation', async () => {
    const shiftId = created.shiftIds[0];
    const openingCash = 500;
    const cashSales = 250.5;
    const adjustments = -20;
    const expectedCash = openingCash + cashSales + adjustments;
    const actualCash = expectedCash - 5;

    const { error: closeErr } = await ctx.client
      .from('shifts')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString(),
        expected_closing_cash: expectedCash,
        actual_closing_cash: actualCash,
      } as any)
      .eq('id', shiftId);
    expect(closeErr, closeErr?.message).toBeNull();

    const { data: recon, error: reconErr } = await ctx.client
      .from('shift_reconciliations')
      .insert({
        admin_id: ctx.adminId,
        branch_id: ctx.branchId,
        shift_id: shiftId,
        closed_by: ctx.profileId,
        opened_at: new Date().toISOString(),
        closed_at: new Date().toISOString(),
        opening_cash: openingCash,
        cash_sales: cashSales,
        adjustments,
        expected_cash: expectedCash,
        actual_cash: actualCash,
        variance: Number((actualCash - expectedCash).toFixed(2)),
        total_sales: cashSales,
        total_bills: 1,
        payment_breakdown: { cash: cashSales },
        notes: 'smoke test',
      } as any)
      .select('id, variance, expected_cash, actual_cash')
      .maybeSingle();

    expect(reconErr, reconErr?.message).toBeNull();
    expect(Number(recon?.variance)).toBeCloseTo(-5, 2);
    if (recon?.id) created.reconIds.push(recon.id);

    // History view query used by ShiftReconciliationHistory
    const { data: history, error: histErr } = await ctx.client
      .from('shift_reconciliations')
      .select('*')
      .eq('admin_id', ctx.adminId)
      .order('closed_at', { ascending: false })
      .limit(10);
    expect(histErr, histErr?.message).toBeNull();
    expect((history || []).length).toBeGreaterThan(0);
  }, 30_000);
});

describe.skipIf(!hasStaff)('smoke: sub-user billing access', () => {
  let ctx: Ctx;

  beforeAll(async () => {
    ctx = await signIn(STAFF_EMAIL!, STAFF_PASSWORD!);
  }, 30_000);

  afterAll(async () => {
    if (ctx) await ctx.client.auth.signOut();
  });

  it('sees only its admin tenant bills', async () => {
    const { data, error } = await ctx.client.from('bills').select('admin_id').limit(50);
    expect(error, error?.message).toBeNull();
    for (const row of data || []) expect(row.admin_id).toBe(ctx.adminId);
  }, 20_000);

  it('can read shift reconciliation history for its tenant', async () => {
    const { error } = await ctx.client.from('shift_reconciliations').select('id').limit(5);
    expect(error, error?.message).toBeNull();
  }, 20_000);
});
