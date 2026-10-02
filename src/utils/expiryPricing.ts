// Shared "sell first" helpers for near-expiry stock (FEFO guidance).
// Purely advisory: nothing here changes stock or prices on its own.

export const daysUntilDate = (d: string): number => {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const e = new Date(d.length === 10 ? d + 'T00:00:00' : d); e.setHours(0, 0, 0, 0);
  return Math.round((e.getTime() - t.getTime()) / 86400000);
};

/** Suggested clearance discount (%) by days left. Expired stock should not be sold. */
export const suggestedClearancePct = (days: number | null | undefined): number => {
  if (days == null || days < 0) return 0;
  if (days === 0) return 50;
  if (days === 1) return 30;
  if (days <= 3) return 20;
  if (days <= 7) return 10;
  return 0;
};

export const expiryLabel = (days: number): string =>
  days < 0 ? `Expired ${-days}d` : days === 0 ? 'Exp today' : `Exp ${days}d`;

export interface NearExpiryInfo { days: number; qty: number; batch?: string }
