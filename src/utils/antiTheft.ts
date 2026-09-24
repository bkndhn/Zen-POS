import { supabase } from '@/integrations/supabase/client';
import { printerManager } from '@/utils/printerManager';

type AlertType = 'item_removed_after_kot' | 'cash_drawer_manual';

/** Fire-and-forget report to the owner. Never blocks billing. */
export async function reportAntiTheft(
  alertType: AlertType,
  opts: { branchId?: string | null; billId?: string | null; billNo?: string | null; amount?: number; details?: Record<string, unknown> } = {},
): Promise<void> {
  try {
    await (supabase.rpc as any)('report_antitheft_event', {
      p_alert_type: alertType,
      p_branch_id: opts.branchId ?? null,
      p_bill_id: opts.billId ?? null,
      p_bill_no: opts.billNo ?? null,
      p_amount: opts.amount ?? 0,
      p_details: opts.details ?? {},
    });
  } catch (e) {
    console.warn('[antiTheft] report failed', e);
  }
}

/** ESC p 0 25 250 — standard ESC/POS cash drawer kick. */
const DRAWER_KICK = new Uint8Array([0x1b, 0x70, 0x00, 0x19, 0xfa]);

export async function openCashDrawerNoSale(branchId?: string | null): Promise<boolean> {
  let ok = false;
  try {
    ok = await printerManager.printRawBytes(DRAWER_KICK);
  } catch {
    ok = false;
  }
  // Report regardless — the attempt itself is what the owner wants to know about.
  void reportAntiTheft('cash_drawer_manual', { branchId, details: { printer_ok: ok } });
  return ok;
}

/** Compare old vs new bill lines; returns removed quantity/value per item. */
export function diffRemovedItems(
  oldItems: Array<{ item_id: string; quantity: number; price: number; name?: string }>,
  newItems: Array<{ id: string; quantity: number }>,
) {
  const newQty = new Map<string, number>();
  newItems.forEach((n) => newQty.set(n.id, (newQty.get(n.id) || 0) + Number(n.quantity || 0)));
  const removed: Array<{ name: string; qty: number; value: number }> = [];
  const oldAgg = new Map<string, { qty: number; price: number; name: string }>();
  oldItems.forEach((o) => {
    const cur = oldAgg.get(o.item_id) || { qty: 0, price: Number(o.price) || 0, name: o.name || 'Item' };
    cur.qty += Number(o.quantity || 0);
    oldAgg.set(o.item_id, cur);
  });
  oldAgg.forEach((o, id) => {
    const diff = o.qty - (newQty.get(id) || 0);
    if (diff > 0.0001) removed.push({ name: o.name, qty: diff, value: diff * o.price });
  });
  return removed;
}
