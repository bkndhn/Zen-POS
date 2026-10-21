/**
 * Turns a bill saved on the device into the exact secure_create_bill request
 * the Billing screen sends online. The server inserts the bill, its lines and
 * the stock deduction in one transaction, so a replay is never half-uploaded.
 */
export interface ReplayableItem {
  item_id: string | null;
  name: string;
  quantity: number;
  price: number;
  total: number;
  base_value?: number;
  unit?: string;
  selling_unit?: string;
  billing_type?: string;
  item_name_override?: string;
}

export interface ReplayableBill {
  bill_no: string;
  total_amount: number;
  discount?: number;
  payment_mode?: string;
  payment_details?: unknown;
  additional_charges?: unknown;
  date: string;
  table_no?: string | null;
  order_type?: string;
  customer_mobile?: string | null;
  customer_gstin?: string | null;
  channel?: string;
  billing_type?: string;
  items: ReplayableItem[];
}

const PAYMENT_ENUM = ['cash', 'card', 'upi', 'other'];

export function toPaymentEnum(mode?: string): string {
  const m = (mode || 'cash').toLowerCase();
  if (PAYMENT_ENUM.includes(m)) return m;
  if (m.includes('online') || m === 'split') return 'other';
  if (m.includes('upi')) return 'upi';
  if (m.includes('card')) return 'card';
  return 'cash';
}

export function buildReplayArgs(
  bill: ReplayableBill,
  ids: { adminId: string; createdBy: string; branchId: string | null },
) {
  const items = bill.items.filter(i => i.quantity > 0);
  const isCalci = (i: ReplayableItem) => i.billing_type === 'calci' || !i.item_id || String(i.item_id).startsWith('calci-');
  return {
    p_bill_payload: {
      bill_no: bill.bill_no, // original number printed on the customer's receipt
      total_amount: bill.total_amount,
      created_by: ids.createdBy,
      payment_mode: toPaymentEnum(bill.payment_mode),
      payment_details: bill.payment_details ?? {},
      additional_charges: Array.isArray(bill.additional_charges) ? bill.additional_charges : [],
      discount: bill.discount || 0,
      order_type: bill.order_type || 'dine_in',
      table_no: bill.table_no || null,
      customer_mobile: bill.customer_mobile || null,
      customer_gstin: bill.customer_gstin || null,
      branch_id: ids.branchId,
      admin_id: ids.adminId,
      channel: bill.channel || 'store',
      billing_type: bill.billing_type || (items.every(isCalci) ? 'calci' : 'pos'),
      date: bill.date,
    },
    p_cart_items: items.map(item => {
      const calci = isCalci(item);
      const unit = item.unit || item.selling_unit || 'pcs';
      return {
        id: calci ? null : item.item_id,
        name: item.name,
        item_name_override: item.item_name_override || item.name,
        price: item.price,
        quantity: item.quantity,
        base_value: item.base_value || 1,
        unit,
        selling_unit: item.selling_unit || unit,
        total: item.total,
        billing_type: calci ? 'calci' : 'pos',
      };
    }),
  };
}
