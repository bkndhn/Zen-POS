export interface PacingBill { date: string; total_amount: number | string; created_at: string }

const minutesOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();

export function pacing(bills: PacingBill[], today: string, yesterday: string, now: Date) {
  const nowMin = minutesOfDay(now);
  let todaySales = 0, todayBills = 0, yesterdaySoFar = 0, yesterdayTotal = 0;
  for (const b of bills) {
    const amt = Number(b.total_amount) || 0;
    if (b.date === today) { todaySales += amt; todayBills++; }
    else if (b.date === yesterday) {
      yesterdayTotal += amt;
      if (minutesOfDay(new Date(b.created_at)) <= nowMin) yesterdaySoFar += amt;
    }
  }
  const hasYesterday = yesterdaySoFar > 0;
  return {
    todaySales, todayBills, yesterdaySoFar, yesterdayTotal, hasYesterday,
    avgTicket: todayBills ? todaySales / todayBills : 0,
    perHour: todaySales / Math.max(1, nowMin / 60),
    changePct: hasYesterday ? ((todaySales - yesterdaySoFar) / yesterdaySoFar) * 100 : 0,
    progressPct: yesterdayTotal ? (todaySales / yesterdayTotal) * 100 : (todaySales ? 100 : 0),
  };
}
