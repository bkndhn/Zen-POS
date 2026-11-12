import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import {
  Wallet,
  Receipt,
  ShoppingBag,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
  Smartphone,
  Banknote,
  CreditCard,
  Search,
  Building2,
  Layers,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useBranchScopedQuery } from '@/hooks/useBranchScopedQuery';
import { useBranchSettings } from '@/hooks/useBranchSettings';
import { format, subDays } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { formatQuantityWithUnit } from '@/utils/timeUtils';
import PopularTimesWidget from '@/components/PopularTimesWidget';
import { OwnerProfitAnalytics } from '@/components/OwnerProfitAnalytics';
import { SalesPacingCard } from '@/components/SalesPacingCard';
import {
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface DashboardStats {
  todaySales: number;
  todayExpenses: number;
  todayProfit: number;
  totalItems: number;
  todayBills: number;
  avgBillValue: number;
  repeatRatio: number;
  repeatCount: number;
  uniqueCustomerCount: number;
}

interface TopItem {
  name: string;
  quantity: number;
  revenue: number;
  unit: string;
}

interface HourlyData {
  hour: number;
  bills: number;
  revenue: number;
}

interface CategoryMixItem {
  name: string;
  value: number;
  pct: number;
  color: string;
}

interface PaymentSplitStats {
  upi: number;
  cash: number;
  card: number;
  other: number;
}

interface YesterdayComparison {
  sales: number;
  bills: number;
  avgBill: number;
  profitMargin: number;
  upiAmount: number;
}

const CATEGORY_COLORS = [
  '#F59E0B',
  '#10B981',
  '#6366F1',
  '#F97316',
  '#14B8A6',
  '#8B5CF6',
  '#EC4899',
  '#64748B',
];

function getFoodEmoji(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('biryani')) return '🍚';
  if (n.includes('chicken') || n.includes('tikka') || n.includes('tandoor')) return '🍗';
  if (n.includes('paneer')) return '🧀';
  if (n.includes('dosa') || n.includes('idli') || n.includes('vada') || n.includes('uttapam')) return '🫓';
  if (n.includes('naan') || n.includes('roti') || n.includes('paratha') || n.includes('kulcha') || n.includes('chapati')) return '🫓';
  if (n.includes('chai') || n.includes('tea') || n.includes('coffee') || n.includes('espresso') || n.includes('latte')) return '☕';
  if (n.includes('lassi') || n.includes('juice') || n.includes('soda') || n.includes('shake') || n.includes('cola') || n.includes('lime') || n.includes('water')) return '🥤';
  if (n.includes('gulab') || n.includes('jamun') || n.includes('rasgulla') || n.includes('kulfi') || n.includes('sweet') || n.includes('dessert') || n.includes('cake') || n.includes('ice')) return '🍮';
  if (n.includes('dal') || n.includes('curry') || n.includes('masala') || n.includes('gravy') || n.includes('korma') || n.includes('butter')) return '🍛';
  if (n.includes('fish') || n.includes('prawn') || n.includes('seafood')) return '🐟';
  if (n.includes('mutton') || n.includes('lamb') || n.includes('keema')) return '🥩';
  if (n.includes('burger') || n.includes('sandwich')) return '🍔';
  if (n.includes('pizza')) return '🍕';
  if (n.includes('noodle') || n.includes('manchurian') || n.includes('momos')) return '🍜';
  if (n.includes('rice') || n.includes('pulao')) return '🌾';
  if (n.includes('roll') || n.includes('wrap')) return '🌯';
  return '🍽️';
}

function formatHourShort(hour: number): string {
  if (hour === 0) return '12A';
  if (hour < 12) return `${hour}A`;
  if (hour === 12) return '12P';
  return `${hour - 12}P`;
}

function formatHourFull(hour: number): string {
  const h = hour > 12 ? hour - 12 : hour || 12;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  return `${h}:00 ${suffix}`;
}

function computePaymentSplit(bills: any[]): PaymentSplitStats {
  const splitTotals: PaymentSplitStats = { upi: 0, cash: 0, card: 0, other: 0 };
  bills.forEach((bill: any) => {
    const pd = bill.payment_details && typeof bill.payment_details === 'object' ? bill.payment_details : null;
    const src = pd?.split && typeof pd.split === 'object' ? pd.split : pd;
    const splitEntries = src
      ? Object.entries(src).filter(([k]) => ['cash', 'upi', 'card', 'other'].includes(k.toLowerCase()))
      : [];
    const splitSum = splitEntries.reduce((s, [, v]) => s + (Number(v) || 0), 0);

    if (splitSum > 0) {
      splitEntries.forEach(([k, v]) => {
        const key = k.toLowerCase();
        const amt = Number(v) || 0;
        if (key === 'upi') splitTotals.upi += amt;
        else if (key === 'cash') splitTotals.cash += amt;
        else if (key === 'card') splitTotals.card += amt;
        else if (key === 'other') splitTotals.other += amt;
      });
      return;
    }

    const total = Number(bill.total_amount || 0);
    const due = Number(bill.due_amount || 0);
    const collected = Math.max(0, total - due);
    const mode = String(bill.payment_mode || 'cash').toLowerCase();
    if (mode === 'upi') splitTotals.upi += collected;
    else if (mode === 'cash') splitTotals.cash += collected;
    else if (mode === 'card') splitTotals.card += collected;
    else splitTotals.other += collected;
  });
  return splitTotals;
}

function computeTrend(current: number, previous: number, isMarginPoints = false) {
  if (isMarginPoints) {
    if (previous === 0 && current === 0) {
      return { hasBaseline: false, isPositive: true, label: '0.0%' };
    }
    const diff = current - previous;
    return {
      hasBaseline: previous !== 0,
      isPositive: diff >= 0,
      label: `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`,
    };
  }
  if (previous > 0) {
    const pct = ((current - previous) / previous) * 100;
    return {
      hasBaseline: true,
      isPositive: pct >= 0,
      label: `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`,
    };
  }
  if (current > 0) {
    return { hasBaseline: false, isPositive: true, label: 'New today' };
  }
  return { hasBaseline: false, isPositive: true, label: '0.0%' };
}

const Dashboard = () => {
  const { profile, adminProfileId } = useAuth();
  const { setActiveBranchId } = useBranch();
  const { t } = useTranslation();
  const adminId = adminProfileId;
  const { data: shopSettings } = useBranchSettings('shop_settings');
  const navigate = useNavigate();

  const { branchFilterId, activeBranch, isAllBranchesView, branches } = useBranchScopedQuery();
  const [stats, setStats] = useState<DashboardStats>({
    todaySales: 0,
    todayExpenses: 0,
    todayProfit: 0,
    totalItems: 0,
    todayBills: 0,
    avgBillValue: 0,
    repeatRatio: 0,
    repeatCount: 0,
    uniqueCustomerCount: 0,
  });
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [allSoldItems, setAllSoldItems] = useState<TopItem[]>([]);
  const [hourlyData, setHourlyData] = useState<HourlyData[]>([]);
  const [categoryMix, setCategoryMix] = useState<CategoryMixItem[]>([]);
  const [paymentSplit, setPaymentSplit] = useState<PaymentSplitStats>({ upi: 0, cash: 0, card: 0, other: 0 });
  const [yesterdayStats, setYesterdayStats] = useState<YesterdayComparison>({
    sales: 0,
    bills: 0,
    avgBill: 0,
    profitMargin: 0,
    upiAmount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [liveOrderCount, setLiveOrderCount] = useState(0);

  // Interactive visual controls
  const [itemSearch, setItemSearch] = useState('');
  const [hourlyMetric, setHourlyMetric] = useState<'revenue' | 'bills'>('revenue');
  const [topItemsSort, setTopItemsSort] = useState<'revenue' | 'quantity'>('revenue');

  const fetchDashboardStats = useCallback(async () => {
    if (!adminId) return;
    try {
      const now = new Date();
      const today = format(now, 'yyyy-MM-dd');
      const yesterday = format(subDays(now, 1), 'yyyy-MM-dd');

      const { offlineManager } = await import('@/utils/offlineManager');

      // Fetch today's bills with items
      let billsData: any[] = [];
      try {
        let billsQuery: any = supabase
          .from('bills')
          .select(`
            *,
            bill_items (
              quantity,
              price,
              total,
              item_name_override,
              items ( name, category, unit )
            )
          `)
          .eq('admin_id', adminId)
          .eq('date', today)
          .or('is_deleted.is.null,is_deleted.eq.false');
        if (branchFilterId) billsQuery = billsQuery.eq('branch_id', branchFilterId);
        const { data } = await billsQuery;
        billsData = data || [];
      } catch {
        // Network failed — continue with empty (offline bills merged below)
      }

      const allBills = await offlineManager.mergeOfflineBills(billsData, adminId, branchFilterId);
      const todayBills = allBills.filter((b: any) => {
        const bDate = b.date || (b.created_at ? format(new Date(b.created_at), 'yyyy-MM-dd') : '');
        return bDate === today && !b.is_deleted;
      });

      const todaySales = todayBills.reduce((sum: number, bill: any) => sum + Number(bill.total_amount || 0), 0);
      const todayBillCount = todayBills.length;
      setLiveOrderCount(todayBillCount);

      // Compute repeat customers
      const uniqueCustomerPhones = todayBills
        .map((b: any) => b.customer_phone)
        .filter(Boolean);

      // Fetch historical bills for the same phones to determine repeat customers
      let repeatCount = 0;
      if (uniqueCustomerPhones.length > 0) {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const { data: historicalBills } = await supabase
          .from('bills')
          .select('customer_phone')
          .eq('admin_id', adminId)
          .eq('is_deleted', false)
          .lt('created_at', today + 'T00:00:00')
          .gte('created_at', thirtyDaysAgo.toISOString())
          .in('customer_phone', uniqueCustomerPhones);

        const repeatPhones = new Set((historicalBills || []).map((b: any) => b.customer_phone));
        repeatCount = uniqueCustomerPhones.filter((p: any) => repeatPhones.has(p)).length;
      }

      const repeatRatio = uniqueCustomerPhones.length > 0
        ? Math.round((repeatCount / uniqueCustomerPhones.length) * 100)
        : 0;

      // Fetch today's expenses — with offline fallback
      let todayExpenses = 0;
      try {
        let expensesQuery: any = supabase
          .from('expenses')
          .select('amount')
          .eq('admin_id', adminId)
          .eq('date', today);
        if (branchFilterId) expensesQuery = expensesQuery.eq('branch_id', branchFilterId);
        const { data: expensesData } = await expensesQuery;
        todayExpenses = expensesData?.reduce((sum: number, expense: any) => sum + Number(expense.amount), 0) || 0;
        await offlineManager.cacheQueryResult('dashboard', `dashboard_expenses_${adminId}_${branchFilterId || 'all'}_${today}`, [{ total: todayExpenses }]);
      } catch {
        const cachedExp = await offlineManager.getCachedQueryResult('dashboard', `dashboard_expenses_${adminId}_${branchFilterId || 'all'}_${today}`);
        todayExpenses = cachedExp?.data?.[0]?.total || 0;
      }

      // Active items count — with offline fallback
      let totalItems = 0;
      try {
        const { data: itemsData } = await supabase
          .from('items')
          .select('id')
          .eq('admin_id', adminId)
          .eq('is_active', true);
        totalItems = itemsData?.length || 0;
        await offlineManager.cacheQueryResult('dashboard', `dashboard_items_count_${adminId}`, [{ count: totalItems }]);
      } catch {
        const cachedItems = await offlineManager.getCachedQueryResult('dashboard', `dashboard_items_count_${adminId}`);
        totalItems = cachedItems?.data?.[0]?.count || 0;
      }

      // Process top items & category mix from bill_items
      const itemSalesMap = new Map<string, TopItem>();
      const categorySalesMap = new Map<string, number>();

      todayBills.forEach((bill: any) => {
        (bill.bill_items || []).forEach((bi: any) => {
          const name = bi.item_name_override || bi.items?.name || 'Unknown';
          const qty = Number(bi.quantity) || 0;
          const rev = Number(bi.total) || (Number(bi.price || 0) * qty);
          const existing = itemSalesMap.get(name) || { name, quantity: 0, revenue: 0, unit: bi.items?.unit || 'pc' };
          existing.quantity += qty;
          existing.revenue += rev;
          itemSalesMap.set(name, existing);

          const category = bi.items?.category || 'General';
          categorySalesMap.set(category, (categorySalesMap.get(category) || 0) + rev);
        });
      });

      const allItemsSorted = [...itemSalesMap.values()].sort((a, b) => b.revenue - a.revenue);
      setAllSoldItems(allItemsSorted);
      setTopItems(allItemsSorted.slice(0, 5));

      const catTotal = [...categorySalesMap.values()].reduce((s, v) => s + v, 0);
      const categoryEntries = [...categorySalesMap.entries()]
        .filter(([, val]) => val > 0)
        .sort((a, b) => b[1] - a[1]);

      const formattedCategories: CategoryMixItem[] = categoryEntries.slice(0, 6).map(([name, value], idx) => ({
        name,
        value,
        pct: catTotal > 0 ? (value / catTotal) * 100 : 0,
        color: CATEGORY_COLORS[idx % CATEGORY_COLORS.length],
      }));
      if (categoryEntries.length > 6) {
        const restVal = categoryEntries.slice(6).reduce((s, [, v]) => s + v, 0);
        formattedCategories.push({
          name: 'Other',
          value: restVal,
          pct: catTotal > 0 ? (restVal / catTotal) * 100 : 0,
          color: CATEGORY_COLORS[6 % CATEGORY_COLORS.length],
        });
      }
      setCategoryMix(formattedCategories);

      // Process payment method split
      setPaymentSplit(computePaymentSplit(todayBills));

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
        repeatRatio,
        repeatCount,
        uniqueCustomerCount: uniqueCustomerPhones.length,
      });

      // Fetch yesterday's comparison safely (non-blocking)
      try {
        let yestBillsQuery: any = supabase
          .from('bills')
          .select('total_amount, payment_mode, payment_details, due_amount, date, is_deleted')
          .eq('admin_id', adminId)
          .eq('date', yesterday)
          .or('is_deleted.is.null,is_deleted.eq.false');
        if (branchFilterId) yestBillsQuery = yestBillsQuery.eq('branch_id', branchFilterId);
        const { data: yestBillsData } = await yestBillsQuery;
        const yestBills = (yestBillsData || []).filter((b: any) => !b.is_deleted);

        let yestExpenses = 0;
        try {
          let yestExpQuery: any = supabase
            .from('expenses')
            .select('amount')
            .eq('admin_id', adminId)
            .eq('date', yesterday);
          if (branchFilterId) yestExpQuery = yestExpQuery.eq('branch_id', branchFilterId);
          const { data: yestExpData } = await yestExpQuery;
          yestExpenses = yestExpData?.reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0) || 0;
        } catch {
          // ignore offline error
        }

        const yestSales = yestBills.reduce((s: number, b: any) => s + Number(b.total_amount || 0), 0);
        const yestCount = yestBills.length;
        const yestAvg = yestCount > 0 ? yestSales / yestCount : 0;
        const yestMargin = yestSales > 0 ? ((yestSales - yestExpenses) / yestSales) * 100 : 0;
        const yestSplit = computePaymentSplit(yestBills);

        setYesterdayStats({
          sales: yestSales,
          bills: yestCount,
          avgBill: yestAvg,
          profitMargin: yestMargin,
          upiAmount: yestSplit.upi,
        });
      } catch {
        // Ignore offline/network errors for comparison metrics
      }
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  }, [adminId, branchFilterId]);

  useEffect(() => {
    if (adminId) fetchDashboardStats();
  }, [adminId, branchFilterId, fetchDashboardStats]);

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
  }, [fetchDashboardStats]);

  // Instant UI Sync across pages and tabs
  useEffect(() => {
    const handleInstantSync = () => {
      fetchDashboardStats();
    };
    window.addEventListener('bills-updated', handleInstantSync);

    const bc = new BroadcastChannel('zenpos-events');
    bc.onmessage = (event) => {
      if (event.data?.type === 'bills-updated') handleInstantSync();
    };

    return () => {
      window.removeEventListener('bills-updated', handleInstantSync);
      bc.close();
    };
  }, [fetchDashboardStats]);

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
    const peak = hourlyData.reduce((max, h) => (h.revenue > max.revenue ? h : max), hourlyData[0]);
    if (peak.revenue === 0) return null;
    return peak;
  }, [hourlyData]);

  // Chart data (business hours 6 AM - 11 PM)
  const hourlyChartData = useMemo(() => {
    return hourlyData
      .filter((h) => h.hour >= 6 && h.hour <= 23)
      .map((h) => ({
        ...h,
        label: formatHourShort(h.hour),
        fullLabel: formatHourFull(h.hour),
      }));
  }, [hourlyData]);

  // Sorted & filtered top items
  const displayedTopItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    const base = allSoldItems.length > 0 ? allSoldItems : topItems;
    const filtered = q ? base.filter((it) => it.name.toLowerCase().includes(q)) : base;
    return [...filtered]
      .sort((a, b) => (topItemsSort === 'quantity' ? b.quantity - a.quantity : b.revenue - a.revenue))
      .slice(0, 5);
  }, [allSoldItems, topItems, topItemsSort, itemSearch]);

  // Payment method breakdown rows
  const paymentRows = useMemo(() => {
    const totalCollected = paymentSplit.upi + paymentSplit.cash + paymentSplit.card + paymentSplit.other;
    const denom = totalCollected > 0 ? totalCollected : 1;
    return [
      {
        key: 'upi',
        label: 'UPI',
        amount: paymentSplit.upi,
        pct: totalCollected > 0 ? (paymentSplit.upi / denom) * 100 : 0,
        barClass: 'bg-purple-500',
        badgeClass: 'bg-purple-100 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400',
        Icon: Smartphone,
      },
      {
        key: 'cash',
        label: 'Cash',
        amount: paymentSplit.cash,
        pct: totalCollected > 0 ? (paymentSplit.cash / denom) * 100 : 0,
        barClass: 'bg-emerald-500',
        badgeClass: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400',
        Icon: Banknote,
      },
      {
        key: 'card',
        label: 'Card',
        amount: paymentSplit.card,
        pct: totalCollected > 0 ? (paymentSplit.card / denom) * 100 : 0,
        barClass: 'bg-blue-500',
        badgeClass: 'bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400',
        Icon: CreditCard,
      },
      {
        key: 'other',
        label: 'Others',
        amount: paymentSplit.other,
        pct: totalCollected > 0 ? (paymentSplit.other / denom) * 100 : 0,
        barClass: 'bg-gray-400',
        badgeClass: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
        Icon: Wallet,
      },
    ];
  }, [paymentSplit]);

  // Quick Insights metrics
  const dinnerContributionPct = useMemo(() => {
    if (stats.todaySales <= 0) return 0;
    const dinnerRev = hourlyData
      .filter((h) => h.hour >= 19 && h.hour <= 23)
      .reduce((s, h) => s + h.revenue, 0);
    return Math.round((dinnerRev / stats.todaySales) * 100);
  }, [hourlyData, stats.todaySales]);

  const todayMarginPct = stats.todaySales > 0 ? (stats.todayProfit / stats.todaySales) * 100 : 0;
  const salesTrend = computeTrend(stats.todaySales, yesterdayStats.sales);
  const billsTrend = computeTrend(liveOrderCount, yesterdayStats.bills);
  const avgBillTrend = computeTrend(stats.avgBillValue, yesterdayStats.avgBill);
  const marginTrend = computeTrend(todayMarginPct, yesterdayStats.profitMargin, true);

  const branchDisplayName = isAllBranchesView
    ? 'All Branches'
    : activeBranch?.shop_name ||
      activeBranch?.name ||
      (shopSettings as any)?.shop_name ||
      profile?.hotel_name ||
      'Main Outlet';

  const branchAddress = isAllBranchesView
    ? `${branches.length} branches — combined view`
    : activeBranch?.address ||
      (shopSettings as any)?.address ||
      t('dashboard.title');

  const userInitial = (profile?.name?.charAt(0) || 'Z').toUpperCase();
  const totalPaymentCollected = paymentSplit.upi + paymentSplit.cash + paymentSplit.card + paymentSplit.other;
  const upiSharePct = totalPaymentCollected > 0 ? Math.round((paymentSplit.upi / totalPaymentCollected) * 100) : 0;
  const upiGrowthPct =
    yesterdayStats.upiAmount > 0
      ? ((paymentSplit.upi - yesterdayStats.upiAmount) / yesterdayStats.upiAmount) * 100
      : null;

  if (loading) {
    return (
      <div className="min-h-full bg-[#F6F5F2] dark:bg-[#121518] p-4 sm:p-6 space-y-6">
        <div className="h-14 bg-white dark:bg-gray-900 rounded-2xl border border-[#E8E6E1] dark:border-gray-800 animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-[#E8E6E1] dark:border-gray-800 animate-pulse">
              <div className="h-10 w-10 bg-gray-100 dark:bg-gray-800 rounded-xl mb-3" />
              <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-1/2 mb-2" />
              <div className="h-8 bg-gray-100 dark:bg-gray-800 rounded w-3/4" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-72 bg-white dark:bg-gray-900 rounded-2xl border border-[#E8E6E1] dark:border-gray-800 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#F6F5F2] dark:bg-[#121518] text-gray-900 dark:text-gray-100 pb-8">
      {/* Header Bar */}
      <header className="bg-white dark:bg-gray-900 border-b border-[#E8E6E1] dark:border-gray-800 px-4 sm:px-6 py-3 flex items-center justify-between gap-3 shadow-sm">
        {/* Left: ZenPOS logo pill + branch info */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center px-3 py-1.5 rounded-xl bg-[#14171A] text-white font-black text-sm tracking-tight shrink-0 shadow-sm">
            <span>Zen</span>
            <span className="text-amber-400">POS</span>
          </div>

          {profile?.role === 'admin' && branches.length > 1 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 text-left rounded-xl px-2 py-1 hover:bg-[#F6F5F2] dark:hover:bg-gray-800 transition-colors min-w-0"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white truncate">
                        {branchDisplayName}
                      </span>
                      <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                    </div>
                    <p className="text-gray-500 dark:text-gray-400 text-xs truncate">{branchAddress}</p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuItem onClick={() => setActiveBranchId(null)} className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-amber-500" />
                  <span>All Branches</span>
                </DropdownMenuItem>
                {branches.map((b) => (
                  <DropdownMenuItem key={b.id} onClick={() => setActiveBranchId(b.id)} className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-gray-500" />
                    <span className="truncate">{b.shop_name || b.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white truncate">
                    {branchDisplayName}
                  </span>
                  <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                </div>
                <p className="text-gray-500 dark:text-gray-400 text-xs truncate">{branchAddress}</p>
              </div>
            </div>
          )}
        </div>

        {/* Center: Search filter */}
        <div className="hidden lg:flex items-center gap-2 bg-[#F6F5F2] dark:bg-gray-800 border border-[#E8E6E1] dark:border-gray-700 rounded-full px-3.5 py-1.5 w-64">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input
            type="text"
            value={itemSearch}
            onChange={(e) => setItemSearch(e.target.value)}
            placeholder="Filter top selling items..."
            className="bg-transparent text-sm text-gray-700 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none w-full"
          />
        </div>

        {/* Right: Live indicator + Calendar chip + Profile avatar */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/30 rounded-full border border-emerald-200 dark:border-emerald-800">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
              {t('dashboard.liveUpdates')}
            </span>
          </div>

          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full px-3 py-1.5 text-xs sm:text-sm flex items-center gap-2 text-gray-700 dark:text-gray-200">
            <Calendar className="w-4 h-4 text-amber-500 shrink-0" />
            <span className="font-medium whitespace-nowrap">{format(new Date(), 'EEE, dd MMM yyyy')}</span>
          </div>

          <div
            className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 flex items-center justify-center font-bold text-sm shrink-0"
            title={profile?.name || 'User'}
          >
            {userInitial}
          </div>
        </div>
      </header>

      {/* Top KPI Cards (4-card row) */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 sm:p-6">
        {/* Card 1: Today's Sales */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-[#E8E6E1] dark:border-gray-800 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-gray-500 dark:text-gray-400 text-sm font-medium">{t('dashboard.todaySales')}</span>
            <div className="bg-orange-100 text-orange-500 w-10 h-10 rounded-xl flex items-center justify-center shrink-0">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          <p className="text-gray-900 dark:text-white text-2xl sm:text-3xl font-bold tracking-tight">
            {formatCurrency(stats.todaySales)}
          </p>
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <span
              className={`inline-flex items-center gap-0.5 text-sm font-medium ${
                salesTrend.isPositive ? 'text-green-600 dark:text-green-400' : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {salesTrend.isPositive ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
              {salesTrend.label}
            </span>
            <span className="text-gray-400 text-xs">vs. previous day</span>
          </div>
        </div>

        {/* Card 2: Total Bills */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-[#E8E6E1] dark:border-gray-800 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-gray-500 dark:text-gray-400 text-sm font-medium">Total Bills</span>
            <div className="bg-teal-100 text-teal-600 w-10 h-10 rounded-xl flex items-center justify-center shrink-0">
              <Receipt className="w-5 h-5" />
            </div>
          </div>
          <p className="text-gray-900 dark:text-white text-2xl sm:text-3xl font-bold tracking-tight">
            {liveOrderCount}
          </p>
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <span
              className={`inline-flex items-center gap-0.5 text-sm font-medium ${
                billsTrend.isPositive ? 'text-green-600 dark:text-green-400' : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {billsTrend.isPositive ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
              {billsTrend.label}
            </span>
            <span className="text-gray-400 text-xs">vs. previous day</span>
          </div>
        </div>

        {/* Card 3: Average Bill */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-[#E8E6E1] dark:border-gray-800 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-gray-500 dark:text-gray-400 text-sm font-medium">{t('dashboard.avgBill')}</span>
            <div className="bg-amber-100 text-amber-600 w-10 h-10 rounded-xl flex items-center justify-center shrink-0">
              <ShoppingBag className="w-5 h-5" />
            </div>
          </div>
          <p className="text-gray-900 dark:text-white text-2xl sm:text-3xl font-bold tracking-tight">
            {formatCurrency(stats.avgBillValue)}
          </p>
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <span
              className={`inline-flex items-center gap-0.5 text-sm font-medium ${
                avgBillTrend.isPositive ? 'text-green-600 dark:text-green-400' : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {avgBillTrend.isPositive ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
              {avgBillTrend.label}
            </span>
            <span className="text-gray-400 text-xs">vs. previous day</span>
          </div>
        </div>

        {/* Card 4: Profit Margin */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-[#E8E6E1] dark:border-gray-800 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-gray-500 dark:text-gray-400 text-sm font-medium">{t('dashboard.profitMargin')}</span>
            <div className="bg-emerald-100 text-emerald-600 w-10 h-10 rounded-xl flex items-center justify-center shrink-0">
              {stats.todayProfit >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
            </div>
          </div>
          <p className="text-gray-900 dark:text-white text-2xl sm:text-3xl font-bold tracking-tight">
            {todayMarginPct.toFixed(1)}%
          </p>
          <div className="flex items-center justify-between gap-1.5 mt-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span
                className={`inline-flex items-center gap-0.5 text-sm font-medium ${
                  marginTrend.isPositive ? 'text-green-600 dark:text-green-400' : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {marginTrend.isPositive ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                {marginTrend.label}
              </span>
              <span className="text-gray-400 text-xs">vs. previous day</span>
            </div>
            <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
              Net {formatCurrency(stats.todayProfit)}
            </span>
          </div>
        </div>
      </section>

      {/* Charts Row: Hourly Sales + Category Mix */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 px-4 sm:px-6 pb-4">
        {/* Left: Hourly Sales */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-[#E8E6E1] dark:border-gray-800">
          <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-lg">📈</span>
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-white">Hourly Sales</h2>
                {peakHour && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Peak at {formatHourFull(peakHour.hour)} ({formatCurrency(peakHour.revenue)})
                  </p>
                )}
              </div>
            </div>
            <select
              aria-label="Hourly chart metric"
              value={hourlyMetric}
              onChange={(e) => setHourlyMetric(e.target.value as 'revenue' | 'bills')}
              className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1 text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none"
            >
              <option value="revenue">Revenue (₹)</option>
              <option value="bills">Bill Count</option>
            </select>
          </div>

          {stats.todayBills === 0 ? (
            <div className="h-60 flex flex-col items-center justify-center text-center text-gray-400">
              <p className="text-sm font-medium">{t('dashboard.noSalesYet')}</p>
              <p className="text-xs mt-1">Hourly sales curve will appear once orders are billed today</p>
            </div>
          ) : (
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={hourlyChartData} margin={{ top: 8, right: 10, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="amberHourlyGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#F59E0B" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8E6E1" vertical={false} />
                  <XAxis
                    dataKey="label"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    stroke="#9CA3AF"
                    interval={2}
                  />
                  <YAxis
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    stroke="#9CA3AF"
                    tickFormatter={(val: number) =>
                      hourlyMetric === 'revenue'
                        ? val >= 1000
                          ? `₹${(val / 1000).toFixed(0)}k`
                          : `₹${val}`
                        : `${val}`
                    }
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      const pt = payload[0].payload as HourlyData & { fullLabel: string };
                      return (
                        <div className="bg-white dark:bg-gray-900 border border-[#E8E6E1] dark:border-gray-700 rounded-xl px-3 py-2 shadow-lg text-xs">
                          <p className="font-semibold text-gray-900 dark:text-white">{pt.fullLabel}</p>
                          <p className="text-amber-600 font-bold mt-0.5">{formatCurrency(pt.revenue)}</p>
                          <p className="text-gray-500">{pt.bills} bills</p>
                        </div>
                      );
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey={hourlyMetric}
                    stroke="#F59E0B"
                    strokeWidth={2.5}
                    fill="url(#amberHourlyGradient)"
                    activeDot={{ r: 5, fill: '#F59E0B', stroke: '#FFFFFF', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Right: Category Mix */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-[#E8E6E1] dark:border-gray-800">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-lg">🍽️</span>
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-white">Category Mix</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {categoryMix.length > 0 ? `${categoryMix.length} active categories` : 'Today'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate('/reports')}
              className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1 text-sm flex items-center gap-1 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <span>Today</span>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-4">
            {/* Donut with center label */}
            <div className="relative h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={
                      categoryMix.length > 0
                        ? categoryMix
                        : [{ name: 'No Sales', value: 1, pct: 100, color: '#E8E6E1' }]
                    }
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={62}
                    outerRadius={88}
                    paddingAngle={categoryMix.length > 1 ? 3 : 0}
                    stroke="none"
                  >
                    {(categoryMix.length > 0
                      ? categoryMix
                      : [{ name: 'No Sales', value: 1, pct: 100, color: '#E8E6E1' }]
                    ).map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  {categoryMix.length > 0 && (
                    <Tooltip
                      formatter={(value: number, name: string) => [formatCurrency(value), name]}
                      contentStyle={{
                        borderRadius: '12px',
                        border: '1px solid #E8E6E1',
                        fontSize: '12px',
                      }}
                    />
                  )}
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-4 text-center">
                <span className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white leading-tight">
                  {formatCurrency(stats.todaySales)}
                </span>
                <span className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">Total Sales</span>
              </div>
            </div>

            {/* Legend */}
            <div className="space-y-2.5">
              {categoryMix.length === 0 ? (
                <p className="text-sm text-gray-400 text-center sm:text-left">
                  {stats.todaySales > 0 ? 'Item category breakdown unavailable' : t('dashboard.noSalesYet')}
                </p>
              ) : (
                categoryMix.map((cat) => (
                  <div key={cat.name} className="flex items-center justify-between gap-2 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="text-gray-700 dark:text-gray-200 font-medium truncate">{cat.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-gray-400">{formatCurrency(cat.value)}</span>
                      <span className="font-semibold text-gray-900 dark:text-white w-10 text-right">
                        {cat.pct.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Bottom 3-Card Row */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 px-4 sm:px-6 pb-6">
        {/* Card 1: Top Selling Items */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-[#E8E6E1] dark:border-gray-800 flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
              <span>🏆</span>
              <span>{t('dashboard.topSellingItems')}</span>
            </h2>
            <select
              aria-label="Sort top selling items"
              value={topItemsSort}
              onChange={(e) => setTopItemsSort(e.target.value as 'revenue' | 'quantity')}
              className="border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1 text-xs font-medium bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none"
            >
              <option value="revenue">By Revenue</option>
              <option value="quantity">By Units</option>
            </select>
          </div>

          {displayedTopItems.length === 0 ? (
            <div className="flex-1 flex items-center justify-center py-8 text-sm text-gray-400">
              {itemSearch.trim() ? 'No matching items found' : t('dashboard.noSalesYet')}
            </div>
          ) : (
            <div className="space-y-3 flex-1">
              {displayedTopItems.map((item, idx) => (
                <div key={item.name} className="flex items-center gap-3">
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      idx === 0
                        ? 'bg-amber-100 text-amber-700'
                        : idx === 1
                          ? 'bg-gray-100 text-gray-700'
                          : idx === 2
                            ? 'bg-orange-100 text-orange-700'
                            : 'bg-gray-50 text-gray-500'
                    }`}
                  >
                    {idx + 1}
                  </span>
                  <div className="w-9 h-9 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-900/50 flex items-center justify-center text-base shrink-0">
                    {getFoodEmoji(item.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.name}</p>
                    <p className="text-xs text-gray-400">
                      {formatQuantityWithUnit(item.quantity, item.unit)} sold
                    </p>
                  </div>
                  <span className="text-sm font-bold text-gray-900 dark:text-white shrink-0">
                    {formatCurrency(item.revenue)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => navigate('/reports')}
            className="mt-4 pt-3 border-t border-[#E8E6E1] dark:border-gray-800 text-xs font-semibold text-amber-600 hover:text-amber-700 flex items-center justify-between w-full"
          >
            <span>{t('common.view')} {t('common.all')}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Card 2: Payment Method Split */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-[#E8E6E1] dark:border-gray-800 flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
              <span>💳</span>
              <span>Payment Method Split</span>
            </h2>
            <span className="text-xs font-medium text-gray-400">
              {formatCurrency(totalPaymentCollected)}
            </span>
          </div>

          <div className="space-y-4 flex-1">
            {paymentRows.map(({ key, label, amount, pct, barClass, badgeClass, Icon }) => (
              <div key={key} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${badgeClass}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="font-medium text-gray-800 dark:text-gray-200">{label}</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                      {pct.toFixed(0)}%
                    </span>
                    <span className="font-bold text-gray-900 dark:text-white min-w-[56px] text-right">
                      {formatCurrency(amount)}
                    </span>
                  </div>
                </div>
                <div className="w-full h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${barClass}`}
                    style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Card 3: Quick Insights */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-[#E8E6E1] dark:border-gray-800 flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
              <span>✨</span>
              <span>Quick Insights</span>
            </h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium border border-amber-200">
              {stats.totalItems} active items
            </span>
          </div>

          <ul className="space-y-3 text-sm flex-1">
            <li className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[#F6F5F2] dark:bg-gray-800/60">
              <span className="text-base leading-none mt-0.5">{salesTrend.isPositive ? '🔼' : '🔽'}</span>
              <span className="text-gray-700 dark:text-gray-200 leading-snug">
                {yesterdayStats.sales > 0 ? (
                  <>
                    Sales are{' '}
                    <strong className="text-gray-900 dark:text-white">
                      {Math.abs(((stats.todaySales - yesterdayStats.sales) / yesterdayStats.sales) * 100).toFixed(0)}%
                    </strong>{' '}
                    {stats.todaySales >= yesterdayStats.sales ? 'higher' : 'lower'} than yesterday
                  </>
                ) : stats.todaySales > 0 ? (
                  <>
                    Today&apos;s revenue is <strong className="text-gray-900 dark:text-white">{formatCurrency(stats.todaySales)}</strong> across {stats.todayBills} bills
                  </>
                ) : (
                  <>No sales recorded yet today — ready for your first order</>
                )}
              </span>
            </li>

            <li className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[#F6F5F2] dark:bg-gray-800/60">
              <span className="text-base leading-none mt-0.5">👥</span>
              <span className="text-gray-700 dark:text-gray-200 leading-snug">
                Dinner hours contribute <strong className="text-gray-900 dark:text-white">{dinnerContributionPct}%</strong> of today&apos;s revenue · {stats.repeatRatio}% repeat customers
              </span>
            </li>

            <li className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[#F6F5F2] dark:bg-gray-800/60">
              <span className="text-base leading-none mt-0.5">⭐</span>
              <span className="text-gray-700 dark:text-gray-200 leading-snug">
                {topItems.length > 0 ? (
                  <>
                    Top seller today: <strong className="text-gray-900 dark:text-white">{topItems[0].name}</strong> ({formatQuantityWithUnit(topItems[0].quantity, topItems[0].unit)})
                  </>
                ) : (
                  <>Top seller today will appear after first item sale</>
                )}
              </span>
            </li>

            <li className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[#F6F5F2] dark:bg-gray-800/60">
              <span className="text-base leading-none mt-0.5">📊</span>
              <span className="text-gray-700 dark:text-gray-200 leading-snug">
                {upiGrowthPct !== null ? (
                  <>
                    UPI payments {upiGrowthPct >= 0 ? 'increased' : 'decreased'} by{' '}
                    <strong className="text-gray-900 dark:text-white">{Math.abs(upiGrowthPct).toFixed(0)}%</strong> vs yesterday
                  </>
                ) : (
                  <>
                    UPI payments account for <strong className="text-gray-900 dark:text-white">{upiSharePct}%</strong> of today&apos;s collections
                  </>
                )}
              </span>
            </li>
          </ul>
        </div>
      </section>

      {/* Quick Navigation Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 px-4 sm:px-6 pb-4">
        {[
          { label: t('billing.newBill'), icon: '🧾', path: '/billing' },
          { label: t('nav.items'), icon: '📋', path: '/items' },
          { label: t('nav.reports'), icon: '📊', path: '/reports' },
          { label: t('nav.expenses'), icon: '💰', path: '/expenses' },
        ].map((item) => (
          <button
            key={item.path}
            type="button"
            onClick={() => navigate(item.path)}
            className="bg-white dark:bg-gray-900 border border-[#E8E6E1] dark:border-gray-800 rounded-2xl p-3.5 text-left hover:shadow-md transition-all group flex items-center justify-between"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-xl">{item.icon}</span>
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{item.label}</span>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-amber-500 transition-colors" />
          </button>
        ))}
      </section>

      {/* Detailed Analytics Widgets */}
      <div className="px-4 sm:px-6 space-y-4">
        {adminId && profile?.role !== 'super_admin' && <SalesPacingCard adminId={adminId} />}
        {adminId && profile?.role !== 'super_admin' && <OwnerProfitAnalytics adminId={adminId} />}

        {/* Popular Times Widget */}
        {adminId && (
          <React.Suspense fallback={<div className="h-48 bg-white/60 rounded-2xl animate-pulse" />}>
            <PopularTimesWidget adminId={adminId} branchFilterId={branchFilterId} />
          </React.Suspense>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
