import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Receipt, Search, Calendar, FileSpreadsheet, Download, IndianRupee, TrendingUp, Layers } from 'lucide-react';
import { AddExpenseDialog } from '@/components/AddExpenseDialog';
import { EditExpenseDialog } from '@/components/EditExpenseDialog';
import { CategorySelector } from '@/components/CategorySelector';
import { cachedFetch, CACHE_KEYS, dataCache } from '@/utils/cacheUtils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { exportToPDF, exportToExcel } from '@/utils/exportUtils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBranchScopedQuery } from '@/hooks/useBranchScopedQuery';
import { AllBranchesReadOnlyBanner } from '@/components/AllBranchesReadOnlyBanner';
import { ServiceHeader, ServiceLoading, StatTile, SectionHeading, EmptyState } from '@/components/service/ServiceUI';
import ExpenseAnalytics from '@/components/expenses/ExpenseAnalytics';


interface Expense {
  id: string;
  expense_name?: string;
  amount: number;
  category: string;
  note?: string;
  date: string;
  created_by: string;
  created_at: string;
}

const Expenses: React.FC = () => {
  const { profile , adminProfileId } = useAuth();
  const adminId = adminProfileId;
  const { branchFilterId, readOnly: branchReadOnly, isAllBranchesView } = useBranchScopedQuery(() => fetchExpenses());
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [filteredExpenses, setFilteredExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [dateFilter, setDateFilter] = useState('today');

  useEffect(() => {
    if (adminId) fetchExpenses();
  }, [adminId, branchFilterId]);

  useEffect(() => {
    applyFilters();
  }, [searchTerm, expenses, startDate, endDate, dateFilter]);

  const fetchExpenses = async () => {
    if (!adminId) return;
    try {
      // Bypass cache when branch filter changes — cache key includes branch
      const cacheKey = `${CACHE_KEYS.EXPENSES}_${adminId}_${branchFilterId || 'all'}_list`;
      const data = await cachedFetch(
        cacheKey,
        async () => {
          let query: any = supabase
            .from('expenses')
            .select('*')
            .eq('admin_id', adminId)
            .order('date', { ascending: false });
          if (branchFilterId) query = query.eq('branch_id', branchFilterId);
          const { data, error } = await query;

          if (error) throw error;
          return data || [];
        }
      );
      setExpenses(data);
    } catch (error) {
      console.error('Error fetching expenses:', error);
      toast({
        title: "Error",
        description: "Failed to fetch expenses",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = expenses;

    // Search filter
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(expense =>
        expense.expense_name?.toLowerCase().includes(searchLower) ||
        (expense.category || '').toLowerCase().includes(searchLower) ||
        expense.note?.toLowerCase().includes(searchLower) ||
        expense.amount.toString().includes(searchTerm)
      );
    }

    // Date filter
    if (dateFilter === 'custom' && startDate && endDate) {
      const startDateObj = new Date(startDate);
      const endDateObj = new Date(endDate);

      if (endDateObj < startDateObj) {
        toast({
          title: "Error",
          description: "End date cannot be before start date",
          variant: "destructive",
        });
        return;
      }

      filtered = filtered.filter(expense => {
        const expenseDate = new Date(expense.date);
        return expenseDate >= startDateObj && expenseDate <= endDateObj;
      });
    } else if (dateFilter === 'today') {
      const today = new Date().toISOString().split('T')[0];
      filtered = filtered.filter(expense => expense.date === today);
    } else if (dateFilter === 'yesterday') {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      filtered = filtered.filter(expense => expense.date === yesterdayStr);
    } else if (dateFilter === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      filtered = filtered.filter(expense => new Date(expense.date) >= weekAgo);
    } else if (dateFilter === 'month') {
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      filtered = filtered.filter(expense => new Date(expense.date) >= monthAgo);
    }

    setFilteredExpenses(filtered);
  };

  const handleCategoriesUpdated = () => {
    // Invalidate categories cache and refetch expenses
    dataCache.invalidate(CACHE_KEYS.CATEGORIES);
    fetchExpenses();
  };

  const deleteExpense = async (expenseId: string) => {
    if (!confirm('Are you sure you want to delete this expense?')) return;

    try {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', expenseId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Expense deleted successfully",
      });

      fetchExpenses();
    } catch (error) {
      console.error('Error deleting expense:', error);
      toast({
        title: "Error",
        description: "Failed to delete expense",
        variant: "destructive",
      });
    }
  };

  const handleExportExcel = () => {
    try {
      const expensesForExport = filteredExpenses.map(expense => ({
        expense_name: expense.expense_name,
        category: expense.category,
        amount: expense.amount,
        date: expense.date,
        note: expense.note
      }));

      const dateRangeText = dateFilter === 'custom'
        ? `${startDate} to ${endDate}`
        : dateFilter.charAt(0).toUpperCase() + dateFilter.slice(1);

      exportToExcel(expensesForExport, `Expenses Report - ${dateRangeText}`);

      toast({
        title: "Success",
        description: "Expenses exported to Excel successfully!",
      });
    } catch (error) {
      console.error('Error exporting Excel:', error);
      toast({
        title: "Error",
        description: "Failed to export Excel file",
        variant: "destructive",
      });
    }
  };

  const handleExportPDF = () => {
    try {
      const expensesForExport = filteredExpenses.map(expense => ({
        expense_name: expense.expense_name,
        category: expense.category,
        amount: expense.amount,
        date: expense.date,
        note: expense.note
      }));

      const dateRangeText = dateFilter === 'custom'
        ? `${startDate} to ${endDate}`
        : dateFilter.charAt(0).toUpperCase() + dateFilter.slice(1);

      exportToPDF(expensesForExport, `Expenses Report - ${dateRangeText}`);

      toast({
        title: "Success",
        description: "Expenses exported to PDF successfully!",
      });
    } catch (error) {
      console.error('Error exporting PDF:', error);
      toast({
        title: "Error",
        description: "Failed to export PDF file",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return <ServiceLoading label="Loading expenses…" cards={4} />;
  }

  const totalExpenses = filteredExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const avgExpense = filteredExpenses.length ? totalExpenses / filteredExpenses.length : 0;
  const topCategory = (() => {
    const map = new Map<string, number>();
    for (const e of filteredExpenses) map.set(e.category || '—', (map.get(e.category || '—') || 0) + e.amount);
    const top = Array.from(map.entries()).sort((a, b) => b[1] - a[1])[0];
    return top ? top[0] : '—';
  })();

  const money = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="p-3 sm:p-4 max-w-full overflow-x-hidden space-y-3 animate-fade-in">
      <AllBranchesReadOnlyBanner message="Switch to a specific branch to add expenses." />

      {/* Sticky frosted header */}
      <ServiceHeader
        icon={Receipt}
        tone="rose"
        sticky
        title="Expenses"
        subtitle="Track, analyse and control your business spend"
        actions={
          profile?.role === 'admin' ? (
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <Button variant="outline" size="sm" onClick={handleExportExcel} className="h-8 rounded-lg text-xs">
                <FileSpreadsheet className="mr-1 h-3.5 w-3.5" />
                Excel
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportPDF} className="h-8 rounded-lg text-xs">
                <Download className="mr-1 h-3.5 w-3.5" />
                PDF
              </Button>
              <CategorySelector onCategoriesUpdated={handleCategoriesUpdated} />
              <AddExpenseDialog onExpenseAdded={fetchExpenses} />
            </div>
          ) : undefined
        }
      />

      {/* Inline totals */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <StatTile icon={IndianRupee} tone="rose" label="Total spend" value={money(totalExpenses)} />
        <StatTile icon={Receipt} tone="sky" label="Entries" value={filteredExpenses.length} />
        <StatTile icon={TrendingUp} tone="amber" label="Average" value={money(avgExpense)} />
        <StatTile icon={Layers} tone="purple" label="Top category" value={<span className="truncate text-sm">{topCategory}</span>} />
      </div>

      {/* Filters */}
      <Card className="border-border/60">
        <CardContent className="p-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <div className="lg:col-span-2">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Search</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Name, category, note or amount…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-9 pl-8 text-xs"
                />
              </div>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Period</Label>
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger className="h-9 text-xs">
                  <Calendar className="mr-1.5 h-3.5 w-3.5 opacity-70" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="yesterday">Yesterday</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {dateFilter === 'custom' && (
              <>
                <div>
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Start</Label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 text-xs" />
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">End</Label>
                  <Input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} className="h-9 text-xs" />
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="list" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-grid">
          <TabsTrigger value="list" className="text-xs">Expenses</TabsTrigger>
          <TabsTrigger value="insights" className="text-xs">Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-3 space-y-3">
          <SectionHeading
            title="All expenses"
            tone="rose"
            icon={Receipt}
            count={filteredExpenses.length}
            actions={
              <span className="text-xs font-bold tabular-nums text-rose-600 dark:text-rose-400">
                {money(totalExpenses)}
              </span>
            }
          />

          {filteredExpenses.length === 0 ? (
            <EmptyState
              icon={Receipt}
              tone="rose"
              title="No expenses found"
              description={
                searchTerm || dateFilter !== 'all'
                  ? 'No expenses match your search criteria.'
                  : 'No expenses recorded yet.'
              }
            />
          ) : (
            <>
              {/* Mobile cards */}
              <div className="grid gap-2 sm:hidden">
                {filteredExpenses.map((expense) => (
                  <Card key={expense.id} className="border-border/60">
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{expense.expense_name || 'Unnamed Expense'}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <Badge variant="secondary" className="text-[10px]">{expense.category}</Badge>
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(expense.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </span>
                          </div>
                          {expense.note && <p className="mt-1 truncate text-[11px] text-muted-foreground">{expense.note}</p>}
                        </div>
                        <p className="shrink-0 text-sm font-bold tabular-nums text-destructive">-{money(expense.amount)}</p>
                      </div>
                      {profile?.role === 'admin' && (
                        <div className="mt-2 flex justify-end gap-2">
                          <EditExpenseDialog expense={expense} onExpenseUpdated={fetchExpenses} />
                          <Button variant="destructive" size="sm" className="h-8 text-xs" onClick={() => deleteExpense(expense.id)}>
                            Delete
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Desktop table */}
              <Card className="hidden overflow-hidden sm:block">
                <CardContent className="p-0">
                  <div className="w-full overflow-x-auto">
                    <Table className="min-w-[700px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="whitespace-nowrap">Name</TableHead>
                          <TableHead className="whitespace-nowrap">Category</TableHead>
                          <TableHead className="whitespace-nowrap text-right">Amount</TableHead>
                          <TableHead className="whitespace-nowrap">Note</TableHead>
                          <TableHead className="whitespace-nowrap">Created</TableHead>
                          {profile?.role === 'admin' && <TableHead className="whitespace-nowrap text-right">Actions</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredExpenses.map((expense) => (
                          <TableRow key={expense.id} className="transition-colors hover:bg-muted/40">
                            <TableCell className="whitespace-nowrap font-medium">{expense.expense_name || 'Unnamed Expense'}</TableCell>
                            <TableCell>
                              <Badge variant="secondary">{expense.category}</Badge>
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-right font-bold tabular-nums text-destructive">
                              -{money(expense.amount)}
                            </TableCell>
                            <TableCell className="max-w-[150px] truncate">{expense.note || '-'}</TableCell>
                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                              {new Date(expense.created_at).toLocaleString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit',
                                hour12: true,
                              })}
                            </TableCell>
                            {profile?.role === 'admin' && (
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                  <EditExpenseDialog expense={expense} onExpenseUpdated={fetchExpenses} />
                                  <Button variant="destructive" size="sm" onClick={() => deleteExpense(expense.id)}>
                                    Delete
                                  </Button>
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="insights" className="mt-3">
          <ExpenseAnalytics
            expenses={filteredExpenses}
            adminId={adminId}
            branchFilterId={branchFilterId}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};


export default Expenses;
