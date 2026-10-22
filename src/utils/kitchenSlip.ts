/** Device-local toggle: attach a kitchen-ticket copy under the customer receipt. */
const KEY = 'zenpos_receipt_kitchen_slip';

export const getKitchenSlipEnabled = (): boolean => {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
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
  const title = ' KITCHEN TICKET ';
  const side = Math.max(0, Math.floor((width - title.length) / 2));
  const lines = ['- '.repeat(Math.ceil(width / 2)).slice(0, width), '-'.repeat(side) + title + '-'.repeat(Math.max(0, width - side - title.length))];
  lines.push(pad(`KOT #${data.billNo.replace('BILL-', '')}`, data.time));
  const type = data.orderType === 'parcel' ? 'PARCEL' : data.orderType === 'dine_in' ? 'DINE IN' : '';
  const where = [data.tableNo ? `Table ${data.tableNo}` : '', type].filter(Boolean).join(' | ');
  if (where) lines.push(where.slice(0, width));
  for (const it of data.items) lines.push(pad(it.name, `x ${fmtQty(it.quantity, it.selling_unit || it.unit)}`));
  lines.push(pad('Items', String(data.items.length)));
  return lines;
};
