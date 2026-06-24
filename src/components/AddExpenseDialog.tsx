import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { Plus } from 'lucide-react';
import { cachedFetch, CACHE_KEYS, dataCache } from '@/utils/cacheUtils';

interface Category {
  id: string;
  name: string;
}

interface AddExpenseDialogProps {
  onExpenseAdded: () => void;
}

export const AddExpenseDialog: React.FC<AddExpenseDialogProps> = ({ onExpenseAdded }) => {
  const { profile } = useAuth();
  const { operatingBranchId, isAllBranchesView } = useBranch();
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [formData, setFormData] = useState({
    expense_name: '',
    amount: '',
    category: '',
    note: '',
    date: new Date().toISOString().split('T')[0]
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      fetchCategories();
    }
  }, [open]);

  const fetchCategories = async () => {
    try {
      const adminId = profile?.role === 'admin' ? profile?.id : profile?.admin_id;
      if (!adminId) return;

      const cacheKey = `${CACHE_KEYS.CATEGORIES}_${adminId}_${operatingBranchId || 'all'}`;

      const data = await cachedFetch(
        cacheKey,
        async () => {
          let query: any = supabase
            .from('expense_categories')
            .select('id, name')
            .eq('is_deleted', false)
            .eq('admin_id', adminId);

          if (operatingBranchId) {
            query = query.eq('branch_id', operatingBranchId);
          }

          const { data, error } = await query.order('name');
          if (error) throw error;
          return data || [];
        }
      );
      setCategories(data);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.amount || !formData.category) {
      toast({
        title: "Error",
        description: "Amount and category are required",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Get admin_id for data isolation
      const adminId = profile?.role === 'admin' ? profile?.id : profile?.admin_id;

      const expenseData = {
        expense_name: formData.expense_name.trim() || null,
        amount: parseFloat(formData.amount),
        category: formData.category,
        note: formData.note.trim() || null,
        date: formData.date,
        created_by: profile?.user_id,
        admin_id: adminId || null,
        branch_id: operatingBranchId || null,
      };

      if (!navigator.onLine) {
        const { offlineManager } = await import('@/utils/offlineManager');
        await offlineManager.addToSyncQueue({
          type: 'expense',
          action: 'create',
          data: expenseData
        });

        toast({
          title: "📴 Expense Saved Offline",
          description: "Expense queued. Will sync when online.",
        });
      } else {
        const { error } = await supabase.from('expenses').insert(expenseData);
        if (error) throw error;

        // Invalidate expenses cache
        dataCache.invalidatePattern(CACHE_KEYS.EXPENSES);

        toast({
          title: "Success",
          description: "Expense added successfully",
        });
      }

      setFormData({ 
        expense_name: '',
        amount: '', 
        category: '', 
        note: '', 
        date: new Date().toISOString().split('T')[0] 
      });
      setOpen(false);
      onExpenseAdded();
    } catch (error) {
      console.error('Error adding expense:', error);
      toast({
        title: "Error",
        description: "Failed to add expense",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={isAllBranchesView} title={isAllBranchesView ? 'Switch to a specific branch to add expense' : ''}>
          <Plus className="w-4 h-4 mr-2" />
          Add Expense
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Expense</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="expense-name">Expense Name (Optional)</Label>
            <Input
              id="expense-name"
              value={formData.expense_name}
              onChange={(e) => setFormData({ ...formData, expense_name: e.target.value })}
              placeholder="Enter expense name"
            />
          </div>

          <div>
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              placeholder="Enter amount"
              required
            />
          </div>
          
          <div>
            <Label htmlFor="category">Category</Label>
            <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.name}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              required
            />
          </div>
          
          <div>
            <Label htmlFor="note">Note (Optional)</Label>
            <Textarea
              id="note"
              value={formData.note}
              onChange={(e) => setFormData({ ...formData, note: e.target.value })}
              placeholder="Enter note (optional)"
              rows={3}
            />
          </div>
          
          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Adding...' : 'Add Expense'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
