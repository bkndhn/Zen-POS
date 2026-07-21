import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { DollarSign, Receipt, TrendingUp, Package } from 'lucide-react';
import { useBranchScopedQuery } from '@/hooks/useBranchScopedQuery';

interface DashboardStats {
  todaySales: number;
  todayExpenses: number;
  todayProfit: number;
  totalItems: number;
  todayBills: number;
}

const Dashboard = () => {
  const { profile , adminProfileId } = useAuth();
  const adminId = adminProfileId;
  const { branchFilterId, activeBranch, isAllBranchesView } = useBranchScopedQuery(() => fetchDashboardStats());
  const [stats, setStats] = useState<DashboardStats>({
    todaySales: 0,
    todayExpenses: 0,
    todayProfit: 0,
    totalItems: 0,
    todayBills: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (adminId) fetchDashboardStats();
  }, [adminId, branchFilterId]);

  // Real-time subscription for updates
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
      const today = new Date().toISOString().split('T')[0];

      // Fetch today's sales (exclude deleted bills) — branch-scoped
      let billsQuery: any = supabase
        .from('bills')
        .select('total_amount')
        .eq('admin_id', adminId)
        .eq('date', today)
        .or('is_deleted.is.null,is_deleted.eq.false');
      if (branchFilterId) billsQuery = billsQuery.eq('branch_id', branchFilterId);
      const { data: billsData } = await billsQuery;

      const todaySales = billsData?.reduce((sum: number, bill: any) => sum + Number(bill.total_amount), 0) || 0;
      const todayBills = billsData?.length || 0;

      // Fetch today's expenses — branch-scoped
      let expensesQuery: any = supabase
        .from('expenses')
        .select('amount')
        .eq('admin_id', adminId)
        .eq('date', today);
      if (branchFilterId) expensesQuery = expensesQuery.eq('branch_id', branchFilterId);
      const { data: expensesData } = await expensesQuery;

      const todayExpenses = expensesData?.reduce((sum: number, expense: any) => sum + Number(expense.amount), 0) || 0;

      // Items are catalog-level (shared across branches)
      const { data: itemsData } = await supabase
        .from('items')
        .select('id')
        .eq('admin_id', adminId)
        .eq('is_active', true);

      const totalItems = itemsData?.length || 0;

      setStats({
        todaySales,
        todayExpenses,
        todayProfit: todaySales - todayExpenses,
        totalItems,
        todayBills,
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
    }).format(amount);
  };

  // Permission check is now handled by ProtectedRoute

  if (loading) {
    return (
      <div className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-4 bg-muted rounded w-3/4"></div>
                <div className="h-6 bg-muted rounded w-1/2"></div>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">Dashboard</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {isAllBranchesView
              ? 'All Branches — combined view'
              : activeBranch
                ? `Branch: ${activeBranch.name}`
                : "Welcome back! Here's what's happening today."}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Today's Sales Card */}
        <div className="bg-card rounded-2xl p-4 shadow-lg dark:shadow-none border border-border">
          <div className="flex items-start justify-between mb-3">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Today's Sales</p>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-emerald-500" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-emerald-500 mb-1">{formatCurrency(stats.todaySales)}</p>
          <p className="text-xs text-muted-foreground">{stats.todayBills} bills processed</p>
        </div>

        {/* Today's Expenses Card */}
        <div className="bg-card rounded-2xl p-4 shadow-lg dark:shadow-none border border-border">
          <div className="flex items-start justify-between mb-3">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Today's Expenses</p>
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 dark:bg-rose-500/20 flex items-center justify-center">
              <Receipt className="w-4 h-4 text-rose-500" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-rose-500 mb-1">{formatCurrency(stats.todayExpenses)}</p>
          <p className="text-xs text-muted-foreground">Operating expenses</p>
        </div>

        {/* Today's Profit Card */}
        <div className="bg-card rounded-2xl p-4 shadow-lg dark:shadow-none border border-border">
          <div className="flex items-start justify-between mb-3">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Today's Profit</p>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${stats.todayProfit >= 0 ? 'bg-blue-500/10 dark:bg-blue-500/20' : 'bg-rose-500/10 dark:bg-rose-500/20'}`}>
              <TrendingUp className={`w-4 h-4 ${stats.todayProfit >= 0 ? 'text-blue-500' : 'text-rose-500'}`} />
            </div>
          </div>
          <p className={`text-xl sm:text-2xl font-bold mb-1 ${stats.todayProfit >= 0 ? 'text-blue-500' : 'text-rose-500'}`}>{formatCurrency(stats.todayProfit)}</p>
          <p className="text-xs text-muted-foreground">Sales minus expenses</p>
        </div>

        {/* Active Items Card */}
        <div className="bg-card rounded-2xl p-4 shadow-lg dark:shadow-none border border-border">
          <div className="flex items-start justify-between mb-3">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Active Items</p>
            <div className="w-8 h-8 rounded-lg bg-violet-500/10 dark:bg-violet-500/20 flex items-center justify-center">
              <Package className="w-4 h-4 text-violet-500" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-foreground mb-1">{stats.totalItems}</p>
          <p className="text-xs text-muted-foreground">Available for billing</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Quick Stats</CardTitle>
            <CardDescription>
              Overview of today's performance
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
              <span className="text-sm font-medium">Average Bill Value</span>
              <span className="text-sm font-bold">
                {stats.todayBills > 0 ? formatCurrency(stats.todaySales / stats.todayBills) : formatCurrency(0)}
              </span>
            </div>
            <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
              <span className="text-sm font-medium">Profit Margin</span>
              <span className="text-sm font-bold">
                {stats.todaySales > 0 ? `${((stats.todayProfit / stats.todaySales) * 100).toFixed(1)}%` : '0%'}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>System Status</CardTitle>
            <CardDescription>
              Current system information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center p-3 bg-success/10 rounded-lg">
              <span className="text-sm font-medium">Database</span>
              <span className="text-sm font-bold text-success">Connected</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-success/10 rounded-lg">
              <span className="text-sm font-medium">POS System</span>
              <span className="text-sm font-bold text-success">Online</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;