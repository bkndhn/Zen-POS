/** Builds a standard UPI payment link for a table's running total. */
export function buildTableUpiLink(opts: { upiId: string; payeeName?: string; amount: number; tableNumber: string }): string | null {
  const upiId = (opts.upiId || '').trim();
  if (!/^[\w.\-]{2,}@[a-zA-Z][\w.\-]*$/.test(upiId)) return null;
  const amount = Math.round(Number(opts.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const params = [
    `pa=${encodeURIComponent(upiId)}`,
    `pn=${encodeURIComponent((opts.payeeName || 'ZenPOS').slice(0, 50))}`,
    `am=${amount.toFixed(2)}`,
    'cu=INR',
    `tn=${encodeURIComponent(`Table ${opts.tableNumber} bill`.slice(0, 50))}`,
  ];
  return `upi://pay?${params.join('&')}`;
}
