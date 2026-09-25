// Server-side subscription pricing. Mirrors src/utils/subscriptionPlans.ts so the
// amount charged is always derived on the server, never taken from the browser.
import { admin } from './pg.ts';

const PRESET_DISCOUNTS: Record<number, number> = { 1: 0, 3: 5, 6: 10, 12: 20, 36: 35 };

function defaultDiscount(months: number): number {
  if (months in PRESET_DISCOUNTS) return PRESET_DISCOUNTS[months];
  return months >= 36 ? 35 : months >= 12 ? 20 : months >= 6 ? 10 : months >= 3 ? 5 : 0;
}

export interface TenantProfile {
  id: string;
  user_id: string;
  role: string;
  admin_id: string | null;
  shop_name?: string | null;
  hotel_name?: string | null;
  mobile_number?: string | null;
}

/** Tenant id = the owning admin's profile id (profiles.id), never taken from the request. */
export function tenantIdOf(p: TenantProfile): string {
  return p.admin_id || p.id;
}

/** Returns the branch id only if it belongs to the tenant; otherwise null. */
export async function ownedBranchId(tenantId: string, branchId: unknown): Promise<string | null> {
  const id = typeof branchId === 'string' ? branchId : '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await admin()
    .from('branches')
    .select('id')
    .eq('id', id)
    .eq('admin_id', tenantId)
    .maybeSingle();
  return data?.id ?? null;
}

export async function resolveSubscriptionPrice(
  tenantId: string,
  months: number,
  branchId: string | null,
): Promise<{ monthlyRate: number; totalAmount: number; months: number }> {
  const sb = admin();
  const m = Math.min(60, Math.max(1, Math.floor(Number(months) || 1)));

  const { data: owner } = await sb
    .from('profiles')
    .select('subscription_amount')
    .eq('id', tenantId)
    .maybeSingle();
  let base = Number(owner?.subscription_amount) || 0;
  if (!(base > 0)) {
    const { data: ps } = await sb.from('payment_settings').select('default_amount').limit(1).maybeSingle();
    base = Number(ps?.default_amount) || 999;
  }

  const { data: packs } = await sb
    .from('subscription_pack_pricing')
    .select('branch_id, months, price_per_month, discount_percentage, is_active')
    .eq('admin_id', tenantId)
    .eq('is_active', true)
    .eq('months', m);
  const rows = packs || [];
  const override =
    (branchId ? rows.find((r: any) => r.branch_id === branchId) : null) ||
    rows.find((r: any) => !r.branch_id) ||
    null;

  const monthly = override?.price_per_month != null ? Number(override.price_per_month) : base;
  const discount = override ? Number(override.discount_percentage) || 0 : defaultDiscount(m);
  const raw = monthly * m;
  const totalAmount = raw - Math.round(raw * (discount / 100));
  return { monthlyRate: Math.round(totalAmount / m), totalAmount, months: m };
}
