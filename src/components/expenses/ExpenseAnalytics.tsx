import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { offlineManager } from '@/utils/offlineManager';
import { Card, CardContent } from '@/components/ui/card';
import { SectionHeading, StatTile } from '@/components/service/ServiceUI';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Line, ComposedChart } from 'recharts';
import { TrendingDown, PieChart as PieIcon, Wallet, Percent } from 'lucide-react';

export interface AnalyticsExpense {
    id: string;
    amount: number;
    category: string;
    date: string;
}

interface Props {
    expenses: AnalyticsExpense[];
    adminId?: string | null;
    branchFilterId?: string | null;
    /** inclusive ISO dates of the active filter range */
    rangeStart?: string | null;
    rangeEnd?: string | null;
}

const PALETTE = [
    'hsl(var(--primary))',
    '#f43f5e',
    '#f59e0b',
    '#10b981',
    '#6366f1',
    '#0ea5e9',
    '#a855f7',
    '#84cc16',
];

const inr = (n: number) =>
    `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export const ExpenseAnalytics: React.FC<Props> = ({
    expenses,
    adminId,
    branchFilterId,
    rangeStart,
    rangeEnd,
}) => {
    const [revenue, setRevenue] = useState<number | null>(null);

    /* ---------------- category breakdown ---------------- */
    const categories = useMemo(() => {
        const map = new Map<string, number>();
        for (const e of expenses) {
            const key = (e.category || 'Uncategorised').trim() || 'Uncategorised';
            map.set(key, (map.get(key) || 0) + (Number(e.amount) || 0));
        }
        const total = Array.from(map.values()).reduce((s, v) => s + v, 0) || 1;
        return Array.from(map.entries())
            .map(([name, value]) => ({ name, value, share: (value / total) * 100 }))
            .sort((a, b) => b.value - a.value);
    }, [expenses]);

    /* ---------------- daily trend + rolling avg ---------------- */
    const daily = useMemo(() => {
        const map = new Map<string, number>();
        for (const e of expenses) {
            const d = (e.date || '').slice(0, 10);
            if (!d) continue;
            map.set(d, (map.get(d) || 0) + (Number(e.amount) || 0));
        }
        const rows = Array.from(map.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([date, amount]) => ({ date, amount }));

        // 3-point rolling average
        return rows.map((row, i) => {
            const window = rows.slice(Math.max(0, i - 2), i + 1);
            const avg = window.reduce((s, r) => s + r.amount, 0) / window.length;
            return {
                ...row,
                avg: Math.round(avg),
                label: new Date(row.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
            };
        });
    }, [expenses]);

    const totalSpend = useMemo(
        () => expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0),
        [expenses]
    );

    /* ---------------- revenue for cashflow impact ---------------- */
    useEffect(() => {
        let cancelled = false;
        const cacheKey = `expense_cashflow_${branchFilterId || 'all'}_${rangeStart || 'x'}_${rangeEnd || 'x'}`;

        const run = async () => {
            if (!adminId) return;

            // cached first — instant render offline
            try {
                const cached = await offlineManager.getCachedQueryResult('analytics', cacheKey);
                if (!cancelled && cached?.data && typeof cached.data.revenue === 'number') {
                    setRevenue(cached.data.revenue);
                }
            } catch {
                /* ignore */
            }

            if (!navigator.onLine) return;

            try {
                let q: any = supabase
                    .from('bills')
                    .select('total_amount, date')
                    .eq('admin_id', adminId)
                    .or('is_deleted.is.null,is_deleted.eq.false');
                if (branchFilterId) q = q.eq('branch_id', branchFilterId);
                if (rangeStart) q = q.gte('date', rangeStart);
                if (rangeEnd) q = q.lte('date', rangeEnd);

                const { data, error } = await q;
                if (error) throw error;
                const sum = (data || []).reduce(
                    (s: number, b: any) => s + (Number(b.total_amount) || 0),
                    0
                );
                if (cancelled) return;
                setRevenue(sum);
                offlineManager.cacheQueryResult('analytics', cacheKey, { revenue: sum }).catch(() => { });
            } catch {
                /* keep cached value */
            }
        };

        run();

        // silent refresh once the outbox flushes
        const onSynced = () => run();
        window.addEventListener('zen-sync-flushed', onSynced);
        return () => {
            cancelled = true;
            window.removeEventListener('zen-sync-flushed', onSynced);
        };
    }, [adminId, branchFilterId, rangeStart, rangeEnd]);

    const ratio = revenue && revenue > 0 ? (totalSpend / revenue) * 100 : null;
    const netAfterExpenses = revenue !== null ? revenue - totalSpend : null;

    if (!expenses.length) {
        return (
            <Card className="border-dashed">
                <CardContent className="py-8 text-center text-xs text-muted-foreground">
                    No expenses in this range yet — insights appear as soon as you add one.
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-3">
            {/* Cashflow impact */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                <StatTile icon={TrendingDown} tone="rose" label="Total spend" value={inr(totalSpend)} />
                <StatTile
                    icon={Wallet}
                    tone="emerald"
                    label="Revenue (range)"
                    value={revenue === null ? '—' : inr(revenue)}
                />
                <StatTile
                    icon={Wallet}
                    tone={netAfterExpenses !== null && netAfterExpenses < 0 ? 'rose' : 'sky'}
                    label="After expenses"
                    value={netAfterExpenses === null ? '—' : inr(netAfterExpenses)}
                />
                <StatTile
                    icon={Percent}
                    tone={ratio !== null && ratio > 40 ? 'amber' : 'purple'}
                    label="Expense / revenue"
                    value={ratio === null ? '—' : `${ratio.toFixed(1)}%`}
                />
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
                {/* Category breakdown */}
                <Card className="overflow-hidden">
                    <CardContent className="p-3 space-y-3">
                        <SectionHeading title="Category breakdown" tone="rose" icon={PieIcon} count={categories.length} />
                        <div className="flex items-center gap-3">
                            <div className="h-[150px] w-[150px] shrink-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={categories}
                                            dataKey="value"
                                            nameKey="name"
                                            innerRadius={42}
                                            outerRadius={70}
                                            paddingAngle={2}
                                            stroke="none"
                                        >
                                            {categories.map((_, i) => (
                                                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            formatter={(v: any) => inr(Number(v))}
                                            contentStyle={{ fontSize: 12, borderRadius: 10 }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="min-w-0 flex-1 space-y-1.5 max-h-[150px] overflow-y-auto pr-1">
                                {categories.slice(0, 8).map((c, i) => (
                                    <div key={c.name} className="flex items-center gap-2 text-xs">
                                        <span
                                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                                            style={{ background: PALETTE[i % PALETTE.length] }}
                                        />
                                        <span className="truncate font-medium">{c.name}</span>
                                        <span className="ml-auto shrink-0 tabular-nums font-semibold">{inr(c.value)}</span>
                                        <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">
                                            {c.share.toFixed(0)}%
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Daily trend */}
                <Card className="overflow-hidden">
                    <CardContent className="p-3 space-y-3">
                        <SectionHeading title="Daily trend" tone="sky" count={daily.length} />
                        <div className="h-[150px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={daily} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.25} />
                                    <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                                    <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={46} />
                                    <Tooltip
                                        formatter={(v: any, n: any) => [inr(Number(v)), n === 'avg' ? 'Rolling avg' : 'Spend']}
                                        contentStyle={{ fontSize: 12, borderRadius: 10 }}
                                    />
                                    <Bar dataKey="amount" radius={[4, 4, 0, 0]} fill="#f43f5e" maxBarSize={26} />
                                    <Line type="monotone" dataKey="avg" stroke="#6366f1" strokeWidth={2} dot={false} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default ExpenseAnalytics;
