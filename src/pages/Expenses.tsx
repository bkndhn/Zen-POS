import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Receipt, Search, Calendar, FileSpreadsheet, Download } from 'lucide-react';
import { AddExpenseDialog } from '@/components/AddExpenseDialog';
import { EditExpenseDialog } from '@/components/EditExpenseDialog';
import { CategorySelector } from '@/components/CategorySelector';
import { cachedFetch, CACHE_KEYS, dataCache } from '@/utils/cacheUtils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { exportToPDF, exportToExcel } from '@/utils/exportUtils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useBranchScopedQuery } from '@/hooks/useBranchScopedQuery';
import { AllBranchesReadOnlyBanner } from '@/components/AllBranchesReadOnlyBanner';

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
        expense.category.toLowerCase().includes(searchLower) ||
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
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading expenses...</p>
        </div>
      </div>
    );
  }

  const totalExpenses = filteredExpenses.reduce((sum, expense) => sum + expense.amount, 0);

  return (
    <div className="p-3 sm:p-4 max-w-full overflow-x-hidden">
      <AllBranchesReadOnlyBanner message="Switch to a specific branch to add expenses." />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-gradient-to-br from-rose-500 to-rose-600 rounded-xl flex items-center justify-center shadow-md shadow-rose-500/20">
            <Receipt className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight">Expenses</h1>
            <p className="text-muted-foreground text-[10px] sm:text-xs">Track your business expenses</p>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {profile?.role === 'admin' && (
            <>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportExcel}
                  className="text-xs h-8 rounded-lg"
                >
                  <FileSpreadsheet className="w-4 h-4 mr-1" />
                  Excel
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportPDF}
                  className="text-xs h-8 rounded-lg"
                >
                  <Download className="w-4 h-4 mr-1" />
                  PDF
                </Button>
              </div>
              <div className="flex gap-2">
                <CategorySelector onCategoriesUpdated={handleCategoriesUpdated} />
                <AddExpenseDialog onExpenseAdded={fetchExpenses} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Date Filter - Updated to match Reports page styling */}
      <Card className="mb-4 p-3 sm:p-4">
        <CardHeader className="p-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
            <Calendar className="w-4 h-4" />
            Date Range
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <Label className="text-xs">Period</Label>
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger className="h-8 text-xs">
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
                  <Label className="text-xs">Start Date</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs">End Date</Label>
                  <Input
                    type="date"
                    value={endDate}
                    min={startDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Search Bar */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Search className="w-5 h-5" />
            Search Expenses
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            placeholder="Search by name, category, note, or amount..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full max-w-full"
          />
        </CardContent>
      </Card>

      {/* Expenses Table */}
      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-4">
            <span className="text-base sm:text-lg">All Expenses ({filteredExpenses.length})</span>
            {filteredExpenses.length > 0 && (
              <div className="text-left sm:text-right">
                <p className="text-base sm:text-lg font-bold text-destructive">
                  Total: ₹{totalExpenses.toFixed(2)}
                </p>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-hidden">
          {filteredExpenses.length === 0 ? (
            <div className="text-center py-16 px-4">
              <Receipt className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-xl font-semibold mb-2">No Expenses Found</h3>
              <p className="text-muted-foreground">
                {searchTerm || dateFilter !== 'all' ? 'No expenses match your search criteria.' : 'No expenses recorded yet.'}
              </p>
            </div>
          ) : (
            <>
              {/* Mobile & Desktop Table View - Horizontal Scroll ONLY within this container */}
              <div className="w-full overflow-hidden grid place-items-start">
                <div className="overflow-x-auto w-full max-w-[85vw] sm:max-w-full pb-2">
                  <Table className="min-w-[700px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-nowrap">Name</TableHead>
                        <TableHead className="whitespace-nowrap">Category</TableHead>
                        <TableHead className="whitespace-nowrap">Amount</TableHead>
                        <TableHead className="whitespace-nowrap">Note</TableHead>
                        <TableHead className="whitespace-nowrap">Created</TableHead>
                        {profile?.role === 'admin' && <TableHead className="text-right whitespace-nowrap">Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredExpenses.map((expense) => (
                        <TableRow key={expense.id}>
                          <TableCell className="font-medium whitespace-nowrap">{expense.expense_name || 'Unnamed Expense'}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{expense.category}</Badge>
                          </TableCell>
                          <TableCell className="font-bold text-destructive whitespace-nowrap">
                            -₹{expense.amount.toFixed(2)}
                          </TableCell>
                          <TableCell className="max-w-[150px] truncate">{expense.note || '-'}</TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {new Date(expense.created_at).toLocaleString('en-US', {
                              year: 'numeric',
                              month: 'numeric',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: 'numeric',
                              second: 'numeric',
                              hour12: true
                            })}
                          </TableCell>
                          {profile?.role === 'admin' && (
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <EditExpenseDialog
                                  expense={expense}
                                  onExpenseUpdated={fetchExpenses}
                                />
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => deleteExpense(expense.id)}
                                >
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
              </div>

            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Expenses;
