// popularTimesUtils.ts

export type HourlyBucket = {
  hour: number; // 0-23
  count: number; // bill count
  revenue: number;
};

export type DayHourMatrix = {
  [dayOfWeek: number]: { [hour: number]: { count: number; revenue: number } };
};

export type PopularTimesData = {
  historical: HourlyBucket[];   // 8-week average for selected day
  today: HourlyBucket[];        // today's actual data (up to current hour)
  peakWindows: { start: number; end: number }[];
  avgDwellMinutes: number;
};

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => {
  if (i === 0) return '12 AM';
  if (i < 12) return `${i} AM`;
  if (i === 12) return '12 PM';
  return `${i - 12} PM`;
});

/**
 * Given raw bills array (each with created_at, order_type, total_amount),
 * build a DayHourMatrix for 8-week historical baseline.
 */
export function buildDayHourMatrix(bills: Array<{ created_at: string; total_amount: number }>): DayHourMatrix {
  const matrix: DayHourMatrix = {};
  for (const bill of bills) {
    const d = new Date(bill.created_at);
    const day = d.getDay(); // 0=Sun
    const hour = d.getHours();
    if (!matrix[day]) matrix[day] = {};
    if (!matrix[day][hour]) matrix[day][hour] = { count: 0, revenue: 0 };
    matrix[day][hour].count++;
    matrix[day][hour].revenue += Number(bill.total_amount || 0);
  }
  return matrix;
}

/**
 * For a given day of week, compute per-hour averages over numWeeks weeks.
 * Returns array of 24 HourlyBuckets (index 0-23).
 */
export function getHistoricalBaseline(matrix: DayHourMatrix, dayOfWeek: number, numWeeks: number): HourlyBucket[] {
  const dayData = matrix[dayOfWeek] || {};
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: Math.round((dayData[hour]?.count || 0) / Math.max(numWeeks, 1)),
    revenue: Math.round((dayData[hour]?.revenue || 0) / Math.max(numWeeks, 1)),
  }));
}

/**
 * Extract today's hourly actual data from bills created today.
 */
export function getTodayActual(bills: Array<{ created_at: string; total_amount: number }>): HourlyBucket[] {
  const todayStr = new Date().toISOString().split('T')[0];
  const hourly: Record<number, HourlyBucket> = {};
  for (const bill of bills) {
    if (!bill.created_at.startsWith(todayStr)) continue;
    const hour = new Date(bill.created_at).getHours();
    if (!hourly[hour]) hourly[hour] = { hour, count: 0, revenue: 0 };
    hourly[hour].count++;
    hourly[hour].revenue += Number(bill.total_amount || 0);
  }
  return Array.from({ length: 24 }, (_, h) => hourly[h] || { hour: h, count: 0, revenue: 0 });
}

/**
 * Find contiguous peak windows where count > 70% of max.
 */
export function findPeakWindows(baseline: HourlyBucket[]): { start: number; end: number }[] {
  const maxCount = Math.max(...baseline.map(b => b.count), 1);
  const threshold = maxCount * 0.7;
  const windows: { start: number; end: number }[] = [];
  let inPeak = false;
  let start = 0;
  for (let i = 0; i < 24; i++) {
    if (baseline[i].count >= threshold && !inPeak) {
      inPeak = true;
      start = i;
    } else if (baseline[i].count < threshold && inPeak) {
      inPeak = false;
      windows.push({ start, end: i - 1 });
    }
  }
  if (inPeak) windows.push({ start, end: 23 });
  return windows;
}

/**
 * Compute live busyness label based on current hour.
 */
export function getLiveBusynessLabel(todayActual: HourlyBucket[], baseline: HourlyBucket[]): string {
  const currentHour = new Date().getHours();
  const todayCount = todayActual[currentHour]?.count || 0;
  const histCount = baseline[currentHour]?.count || 0;
  if (histCount === 0) return 'Live: Quiet right now';
  const ratio = todayCount / histCount;
  if (ratio < 0.7) return 'Live: Less busy than usual';
  if (ratio > 1.2) return 'Live: Usually as busy as it gets';
  return 'Live: Normal rush right now';
}

/**
 * Compute daypart breakdown.
 */
export type Daypart = {
  label: string;
  emoji: string;
  startHour: number;
  endHour: number;
  revenue: number;
  count: number;
  aov: number;
};

export const DAYPARTS = [
  { label: 'Breakfast', emoji: '☀️', startHour: 7, endHour: 11 },
  { label: 'Lunch Rush', emoji: '🍜', startHour: 11, endHour: 15 },
  { label: 'Tea & Snacks', emoji: '☕', startHour: 15, endHour: 19 },
  { label: 'Dinner Rush', emoji: '🍽️', startHour: 19, endHour: 23 },
  { label: 'Late Night', emoji: '🌙', startHour: 23, endHour: 27 }, // 27 = next day 3 AM
];

export function computeDayparts(bills: Array<{ created_at: string; total_amount: number }>): Daypart[] {
  const todayStr = new Date().toISOString().split('T')[0];
  const todayBills = bills.filter(b => b.created_at.startsWith(todayStr));
  return DAYPARTS.map(dp => {
    const slice = todayBills.filter(b => {
      const h = new Date(b.created_at).getHours();
      const adjustedH = h < 4 ? h + 24 : h; // handle midnight cross
      return adjustedH >= dp.startHour && adjustedH < dp.endHour;
    });
    const revenue = slice.reduce((s, b) => s + Number(b.total_amount || 0), 0);
    const count = slice.length;
    return { ...dp, revenue: Math.round(revenue), count, aov: count > 0 ? Math.round(revenue / count) : 0 };
  });
}

/**
 * Build 7x24 heatmap matrix (normalized 0-1) for display.
 */
export type HeatmapCell = {
  day: number;
  hour: number;
  count: number;
  revenue: number;
  normalized: number; // 0 to 1 for color intensity
};

export function buildHeatmap(bills: Array<{ created_at: string; total_amount: number }>): HeatmapCell[][] {
  const matrix = buildDayHourMatrix(bills);
  // Find max count across all cells for normalization
  let maxCount = 1;
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const c = matrix[d]?.[h]?.count || 0;
      if (c > maxCount) maxCount = c;
    }
  }
  // Return 7 rows x 24 cols
  return Array.from({ length: 7 }, (_, day) =>
    Array.from({ length: 24 }, (_, hour) => ({
      day,
      hour,
      count: matrix[day]?.[hour]?.count || 0,
      revenue: Math.round(matrix[day]?.[hour]?.revenue || 0),
      normalized: (matrix[day]?.[hour]?.count || 0) / maxCount,
    }))
  );
}

/**
 * Basket affinity: find most common item pairs from bill_items data.
 */
export type ItemPair = {
  item1: string;
  item2: string;
  coOccurrences: number;
  coOccurrenceRate: number; // percent of bills containing both
};

export function findTopItemPairs(
  billItems: Array<{ bill_id: string; item_name: string }>,
  topN = 5
): ItemPair[] {
  // Group items by bill
  const billMap: Record<string, string[]> = {};
  for (const bi of billItems) {
    if (!billMap[bi.bill_id]) billMap[bi.bill_id] = [];
    billMap[bi.bill_id].push(bi.item_name);
  }
  const pairCounts: Record<string, number> = {};
  const totalBills = Object.keys(billMap).length;
  for (const items of Object.values(billMap)) {
    const unique = [...new Set(items)];
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const key = [unique[i], unique[j]].sort().join(' || ');
        pairCounts[key] = (pairCounts[key] || 0) + 1;
      }
    }
  }
  return Object.entries(pairCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([key, count]) => {
      const [item1, item2] = key.split(' || ');
      return { item1, item2, coOccurrences: count, coOccurrenceRate: Math.round((count / totalBills) * 100) };
    });
}
