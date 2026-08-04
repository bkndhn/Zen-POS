import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { DollarSign, Receipt, TrendingUp, TrendingDown, Package, Flame, Clock, ArrowRight, Users } from 'lucide-react';
import { useBranchScopedQuery } from '@/hooks/useBranchScopedQuery';
import { useBranchSettings } from '@/hooks/useBranchSettings';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

interface DashboardStats {
  todaySales: number;
  todayExpenses: number;
  todayProfit: number;
  totalItems: number;
  todayBills: number;
  avgBillValue: number;
}

interface TopItem {
  name: string;
  quantity: number;
  revenue: number;
}

interface HourlyData {
  hour: number;
  bills: number;
  revenue: number;
}

const Dashboard = () => {
  const { profile, adminProfileId } = useAuth();
  const adminId = adminProfileId;
  const { data: shopSettings } = useBranchSettings('shop_settings');
  const navigate = useNavigate();

  const { branchFilterId, activeBranch, isAllBranchesView } = useBranchScopedQuery(() => fetchDashboardStats());
  const [stats, setStats] = useState<DashboardStats>({
    todaySales: 0,
    todayExpenses: 0,
    todayProfit: 0,
    totalItems: 0,
    todayBills: 0,
    avgBillValue: 0,
  });
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [hourlyData, setHourlyData] = useState<HourlyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveOrderCount, setLiveOrderCount] = useState(0);

  useEffect(() => {
    if (adminId) fetchDashboardStats();
  }, [adminId, branchFilterId]);

  // Real-time subscription for live order count
  useEffect(() => {
    const billsChannel = supabase
      .channel('dashboard-bills-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bills' }, () => {
        fetchDashboardStats();
      })
      .subscribe();

    const expensesChannel = supabase
      .channel('dashboard-expenses-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => {
        fetchDashboardStats();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(billsChannel);
      supabase.removeChannel(expensesChannel);
    };
  }, []);

  const fetchDashboardStats = useCallback(async () => {
    if (!adminId) return;
    try {
      const today = format(new Date(), 'yyyy-MM-dd');

      const { offlineManager } = await import('@/utils/offlineManager');

      // Fetch today's bills with items
      let billsQuery: any = supabase
        .from('bills')
        .select(`
          *,
          bill_items (
            quantity,
            price,
            total,
            item_name_override,
            items ( name, category )
          )
        `)
        .eq('admin_id', adminId)
        .eq('date', today)
        .or('is_deleted.is.null,is_deleted.eq.false');
      if (branchFilterId) billsQuery = billsQuery.eq('branch_id', branchFilterId);
      const { data: billsData } = await billsQuery;

      const allBills = await offlineManager.mergeOfflineBills(billsData || [], adminId, branchFilterId);
      const todayBills = allBills.filter((b: any) => {
        const bDate = b.date || (b.created_at ? format(new Date(b.created_at), 'yyyy-MM-dd') : '');
        return bDate === today && !b.is_deleted;
      });

      const todaySales = todayBills.reduce((sum: number, bill: any) => sum + Number(bill.total_amount || 0), 0);
      const todayBillCount = todayBills.length;
      setLiveOrderCount(todayBillCount);

      // Fetch today's expenses
      let expensesQuery: any = supabase
        .from('expenses')
        .select('amount')
        .eq('admin_id', adminId)
        .eq('date', today);
      if (branchFilterId) expensesQuery = expensesQuery.eq('branch_id', branchFilterId);
      const { data: expensesData } = await expensesQuery;
      const todayExpenses = expensesData?.reduce((sum: number, expense: any) => sum + Number(expense.amount), 0) || 0;

      // Active items count
      const { data: itemsData } = await supabase
        .from('items')
        .select('id')
        .eq('admin_id', adminId)
        .eq('is_active', true);

      const totalItems = itemsData?.length || 0;

      // Process top items from bill_items
      const itemSalesMap = new Map<string, { name: string; quantity: number; revenue: number }>();
      todayBills.forEach((bill: any) => {
        (bill.bill_items || []).forEach((bi: any) => {
          const name = bi.item_name_override || bi.items?.name || 'Unknown';
          const existing = itemSalesMap.get(name) || { name, quantity: 0, revenue: 0 };
          existing.quantity += Number(bi.quantity) || 0;
          existing.revenue += Number(bi.total) || 0;
          itemSalesMap.set(name, existing);
        });
      });
      const sortedItems = [...itemSalesMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
      setTopItems(sortedItems);

      // Process hourly data
      const hourMap = new Map<number, { bills: number; revenue: number }>();
      todayBills.forEach((bill: any) => {
        const hour = new Date(bill.created_at).getHours();
        const existing = hourMap.get(hour) || { bills: 0, revenue: 0 };
        existing.bills += 1;
        existing.revenue += Number(bill.total_amount || 0);
        hourMap.set(hour, existing);
      });
      // Fill all hours 0-23
      const hourlyArr: HourlyData[] = [];
      for (let h = 0; h < 24; h++) {
        const data = hourMap.get(h) || { bills: 0, revenue: 0 };
        hourlyArr.push({ hour: h, ...data });
      }
      setHourlyData(hourlyArr);

      setStats({
        todaySales,
        todayExpenses,
        todayProfit: todaySales - todayExpenses,
        totalItems,
        todayBills: todayBillCount,
        avgBillValue: todayBillCount > 0 ? todaySales / todayBillCount : 0,
      });
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  }, [adminId, branchFilterId]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Find peak hour
  const peakHour = useMemo(() => {
    if (hourlyData.length === 0) return null;
    const peak = hourlyData.reduce((max, h) => h.revenue > max.revenue ? h : max, hourlyData[0]);
    if (peak.revenue === 0) return null;
    return peak;
  }, [hourlyData]);

  // Max revenue for chart scaling
  const maxHourlyRevenue = useMemo(() => {
    return Math.max(...hourlyData.map(h => h.revenue), 1);
  }, [hourlyData]);

  if (loading) {
    return (
      <div className="p-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-card rounded-2xl p-4 border animate-pulse">
              <div className="h-4 bg-muted rounded w-3/4 mb-3" />
              <div className="h-8 bg-muted rounded w-1/2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const currentHour = new Date().getHours();

  return (
    <div className="p-3 sm:p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">Dashboard</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {isAllBranchesView
              ? 'All Branches — combined view'
              : activeBranch
                ? `Branch: ${activeBranch.name}`
                : "Today's performance at a glance"}
          </p>
        </div>
        {/* Live indicator */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/20 rounded-full border border-emerald-200 dark:border-emerald-800">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Live</span>
        </div>
      </div>

      {/* Main Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Today's Revenue */}
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-4 text-white shadow-lg shadow-emerald-500/20">
          <div className="flex items-start justify-between mb-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-100">Revenue</p>
            <DollarSign className="w-4 h-4 text-emerald-200" />
          </div>
          <p className="text-2xl font-black">{formatCurrency(stats.todaySales)}</p>
          <p className="text-[10px] text-emerald-100 mt-1">{stats.todayBills} bills today</p>
        </div>

        {/* Today's Expenses */}
        <div className="bg-card rounded-2xl p-4 border shadow-sm">
          <div className="flex items-start justify-between mb-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Expenses</p>
            <Receipt className="w-4 h-4 text-rose-500" />
          </div>
          <p className="text-xl font-bold text-rose-500">{formatCurrency(stats.todayExpenses)}</p>
          <p className="text-[10px] text-muted-foreground mt-1">Operating costs</p>
        </div>

        {/* Net Profit */}
        <div className="bg-card rounded-2xl p-4 border shadow-sm">
          <div className="flex items-start justify-between mb-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Net Profit</p>
            {stats.todayProfit >= 0 ? <TrendingUp className="w-4 h-4 text-blue-500" /> : <TrendingDown className="w-4 h-4 text-rose-500" />}
          </div>
          <p className={`text-xl font-bold ${stats.todayProfit >= 0 ? 'text-blue-500' : 'text-rose-500'}`}>{formatCurrency(stats.todayProfit)}</p>
          <p className="text-[10px] text-muted-foreground mt-1">
            {stats.todaySales > 0 ? `${((stats.todayProfit / stats.todaySales) * 100).toFixed(1)}% margin` : '—'}
          </p>
        </div>

        {/* Avg Bill Value */}
        <div className="bg-card rounded-2xl p-4 border shadow-sm">
          <div className="flex items-start justify-between mb-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Avg Bill</p>
            <Users className="w-4 h-4 text-violet-500" />
          </div>
          <p className="text-xl font-bold text-foreground">{formatCurrency(stats.avgBillValue)}</p>
          <p className="text-[10px] text-muted-foreground mt-1">Per customer</p>
        </div>

        {/* Live Order Count */}
        <div className="bg-card rounded-2xl p-4 border shadow-sm">
          <div className="flex items-start justify-between mb-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Orders</p>
            <Package className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-xl font-bold text-foreground">{liveOrderCount}</p>
          <p className="text-[10px] text-muted-foreground mt-1">{stats.totalItems} menu items</p>
        </div>
      </div>

      {/* Second Row: Top Items + Peak Hours */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top 5 Selling Items */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-1.5"><Flame className="w-4 h-4 text-orange-500" /> Top 5 Items Today</span>
              <button onClick={() => navigate('/reports')} className="text-xs text-primary hover:underline flex items-center gap-0.5">
                View All <ArrowRight className="w-3 h-3" />
              </button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topItems.length === 0 ? (
              <p className="text-center text-muted-foreground py-6 text-sm">No sales yet today</p>
            ) : (
              <div className="space-y-2.5">
                {topItems.map((item, idx) => {
                  const maxRevenue = topItems[0]?.revenue || 1;
                  return (
                    <div key={item.name} className="flex items-center gap-3">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${idx === 0 ? 'bg-amber-500 text-white' : idx === 1 ? 'bg-slate-400 text-white' : idx === 2 ? 'bg-amber-700 text-white' : 'bg-muted text-muted-foreground'}`}>
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <p className="text-sm font-medium truncate">{item.name}</p>
                          <p className="text-sm font-bold text-primary ml-2">₹{item.revenue.toFixed(0)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-primary to-primary/60 rounded-full transition-all" style={{ width: `${(item.revenue / maxRevenue) * 100}%` }} />
                          </div>
                          <span className="text-[10px] text-muted-foreground flex-shrink-0">{item.quantity} sold</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Peak Hour Chart */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-1.5"><Clock className="w-4 h-4 text-blue-500" /> Hourly Sales</span>
              {peakHour && (
                <Badge className="bg-blue-100 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 text-[10px] border-0">
                  Peak: {peakHour.hour > 12 ? peakHour.hour - 12 : peakHour.hour || 12}{peakHour.hour >= 12 ? 'PM' : 'AM'} — ₹{peakHour.revenue.toFixed(0)}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.todayBills === 0 ? (
              <p className="text-center text-muted-foreground py-6 text-sm">No sales yet today</p>
            ) : (
              <div className="space-y-2">
                {/* Chart */}
                <div className="flex items-end gap-[2px] h-32">
                  {hourlyData.filter(h => h.hour >= 6 && h.hour <= 23).map(h => {
                    const height = maxHourlyRevenue > 0 ? (h.revenue / maxHourlyRevenue) * 100 : 0;
                    const isPeak = peakHour?.hour === h.hour;
                    const isCurrent = h.hour === currentHour;
                    return (
                      <div key={h.hour} className="flex-1 flex flex-col items-center justify-end gap-0.5 group relative">
                        {/* Tooltip */}
                        <div className="absolute bottom-full mb-1 hidden group-hover:block bg-foreground text-background text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap z-10">
                          {h.hour > 12 ? h.hour - 12 : h.hour || 12}{h.hour >= 12 ? 'PM' : 'AM'}: ₹{h.revenue.toFixed(0)} ({h.bills} bills)
                        </div>
                        <div
                          className={`w-full rounded-t transition-all ${isPeak ? 'bg-gradient-to-t from-blue-600 to-blue-400' : isCurrent ? 'bg-gradient-to-t from-emerald-600 to-emerald-400' : h.revenue > 0 ? 'bg-primary/40 hover:bg-primary/60' : 'bg-muted/60'}`}
                          style={{ height: `${Math.max(height, h.revenue > 0 ? 4 : 1)}%` }}
                        />
                        {(h.hour % 3 === 0) && (
                          <span className="text-[8px] text-muted-foreground">{h.hour > 12 ? h.hour - 12 : h.hour || 12}{h.hour >= 12 ? 'p' : 'a'}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* Legend */}
                <div className="flex items-center gap-4 justify-center text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-blue-500" /> Peak Hour</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-500" /> Current</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Navigation */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'New Bill', icon: '🧾', path: '/billing', color: 'from-emerald-500/10 to-emerald-500/5 border-emerald-200 dark:border-emerald-800' },
          { label: 'Menu Items', icon: '📋', path: '/items', color: 'from-blue-500/10 to-blue-500/5 border-blue-200 dark:border-blue-800' },
          { label: 'Reports', icon: '📊', path: '/reports', color: 'from-violet-500/10 to-violet-500/5 border-violet-200 dark:border-violet-800' },
          { label: 'Expenses', icon: '💰', path: '/expenses', color: 'from-amber-500/10 to-amber-500/5 border-amber-200 dark:border-amber-800' },
        ].map(item => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={`bg-gradient-to-br ${item.color} border rounded-xl p-3 text-left hover:shadow-md transition-all group`}
          >
            <span className="text-2xl block mb-1">{item.icon}</span>
            <span className="text-sm font-semibold flex items-center gap-1 group-hover:gap-2 transition-all">
              {item.label}
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default Dashboard;