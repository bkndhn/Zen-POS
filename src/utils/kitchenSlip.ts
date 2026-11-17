/** Device-local toggle: attach a compact kitchen stub under the customer receipt. Off unless chosen, to save paper. */
const KEY = 'zenpos_receipt_kitchen_slip';

export const getKitchenSlipEnabled = (): boolean => {
  try { return localStorage.getItem(KEY) === 'on'; } catch { return false; }
};

export const setKitchenSlipEnabled = (on: boolean) => {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* ignore */ }
};

export interface SlipItem { name: string; quantity: number; unit?: string; selling_unit?: string }

/** Plain text lines for the kitchen slip, same details the kitchen ticket carries. */
export const buildKitchenSlipLines = (
  data: { billNo: string; time: string; tableNo?: string; orderType?: 'dine_in' | 'parcel'; items: SlipItem[] },
  width: number,
  fmtQty: (q: number, unit?: string) => string = (q) => String(q),
): string[] => {
  const pad = (l: string, r: string) => {
    const room = Math.max(1, width - r.length - 1);
    return (l.length > room ? l.slice(0, room) : l.padEnd(room)) + ' ' + r;
  };
  const type = data.orderType === 'parcel' ? 'PARCEL' : data.orderType === 'dine_in' ? 'DINE IN' : '';
  const head = [`KOT #${data.billNo.replace('BILL-', '')}`, data.tableNo ? `T${data.tableNo}` : '', type].filter(Boolean).join(' ');
  const lines = ['- '.repeat(Math.ceil(width / 2)).slice(0, width), pad(head, data.time)];
  for (const it of data.items) lines.push(pad(it.name, `x ${fmtQty(it.quantity, it.selling_unit || it.unit)}`));
  return lines;
};
