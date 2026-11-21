import { supabase } from "@/integrations/supabase/client";

/**
 * Loads archived bills (moved out of the live table) for a date range,
 * shaped like live `bills` rows with nested `bill_items` + `items`, so
 * readers can merge them without double counting.
 */
export async function fetchArchivedBills(opts: {
  adminId: string;
  start: string;
  end: string;
  branchId?: string | null;
  deleted: boolean;
}): Promise<any[]> {
  try {
    let q: any = (supabase as any)
      .from("bills_archive")
      .select("*")
      .eq("admin_id", opts.adminId)
      .gte("date", opts.start)
      .lte("date", opts.end);
    if (opts.branchId) q = q.eq("branch_id", opts.branchId);
    q = opts.deleted ? q.eq("is_deleted", true) : q.or("is_deleted.is.null,is_deleted.eq.false");
    const { data: bills, error } = await q;
    if (error || !bills?.length) return [];

    const ids = bills.map((b: any) => b.id);
    const { data: lines } = await (supabase as any)
      .from("bill_items_archive")
      .select("*")
      .in("bill_id", ids);
    const itemIds = [...new Set((lines || []).map((l: any) => l.item_id).filter(Boolean))];
    const itemMap = new Map<string, any>();
    if (itemIds.length) {
      const { data: items } = await supabase
        .from("items")
        .select("id,name,category,is_active,unit,base_value,purchase_rate")
        .in("id", itemIds as string[]);
      (items || []).forEach((i: any) => itemMap.set(i.id, i));
    }
    const byBill = new Map<string, any[]>();
    (lines || []).forEach((l: any) => {
      const arr = byBill.get(l.bill_id) || [];
      arr.push({ ...l, items: l.item_id ? itemMap.get(l.item_id) ?? null : null });
      byBill.set(l.bill_id, arr);
    });
    return bills.map((b: any) => ({ ...b, bill_items: byBill.get(b.id) || [], is_archived: true }));
  } catch {
    return [];
  }
}

/** Merge live + archived, live wins on duplicate ids, newest first. */
export function mergeBills(live: any[], archived: any[]): any[] {
  const seen = new Set(live.map((b) => b.id));
  const merged = [...live, ...archived.filter((b) => !seen.has(b.id))];
  return merged.sort((a, b) => String(b.created_at ?? b.date).localeCompare(String(a.created_at ?? a.date)));
}
