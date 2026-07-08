/**
 * Central 2-decimal formatting helpers.
 * Money: always 2 decimals ("102.50").
 * Quantity: 2 decimals with trailing zero trim ("1.5", "2", "0.13").
 * Percent: 2 decimals with trim.
 * Use these instead of ad-hoc .toFixed() calls to keep precision consistent.
 */

export const round2 = (n: number): number => {
  if (!Number.isFinite(Number(n))) return 0;
  return Math.round(Number(n) * 100) / 100;
};

/** Format money — always 2 decimals. e.g. formatMoney(12.5) => "12.50" */
export const formatMoney = (n: number | string | null | undefined): string => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0.00';
  return v.toFixed(2);
};

/** Format money with currency symbol. */
export const formatINR = (n: number | string | null | undefined): string =>
  `₹${formatMoney(n)}`;

/** Format quantity — up to 2 decimals, strip trailing zeros. */
export const formatQty = (n: number | string | null | undefined): string => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  const sign = v < 0 ? -1 : 1;
  const r = sign * (Math.trunc(Math.abs(v) * 100) / 100);
  if (Number.isInteger(r)) return String(r);
  return r.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
};

/** Format percentage — up to 2 decimals trimmed. */
export const formatPercent = (n: number | string | null | undefined): string => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0%';
  const r = Math.round(v * 100) / 100;
  return (Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')) + '%';
};
