import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { Settings, Plus, Edit, Trash2 } from 'lucide-react';

interface ExpenseCategory {
  id: string;
  name: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

interface CategorySelectorProps {
  onCategoriesUpdated?: () => void;
}

export const CategorySelector: React.FC<CategorySelectorProps> = ({ onCategoriesUpdated }) => {
  const { profile , adminProfileId } = useAuth();
  const { operatingBranchId, isAllBranchesView } = useBranch();
  const adminId = adminProfileId;
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      fetchCategories();
    }
  }, [open, operatingBranchId]);

  const fetchCategories = async () => {
    try {
      let query: any = supabase
        .from('expense_categories')
        .select('*')
        .eq('is_deleted', false);

      if (adminId) query = query.eq('admin_id', adminId);
      if (operatingBranchId) {
        query = query.eq('branch_id', operatingBranchId);
      }

      const { data, error } = await query.order('name');

      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error('Error fetching expense categories:', error);
      toast({
        title: "Error",
        description: "Failed to fetch expense categories",
        variant: "destructive",
      });
    }
  };

  const addCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;

    // Check if category already exists
    const existingCategory = categories.find(
      cat => cat.name.toLowerCase() === newCategoryName.trim().toLowerCase()
    );

    if (existingCategory) {
      toast({
        title: "Error",
        description: "Category already exists",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('expense_categories')
        .insert([{ 
          name: newCategoryName.trim(),
          admin_id: adminId || null,
          branch_id: operatingBranchId || null,
        }]);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Expense category added successfully",
      });

      setNewCategoryName('');
      fetchCategories();
      onCategoriesUpdated?.();
    } catch (error) {
      console.error('Error adding expense category:', error);
      toast({
        title: "Error",
        description: "Failed to add expense category",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const updateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory || !newCategoryName.trim()) return;

    // Check if category name already exists (excluding current category)
    const existingCategory = categories.find(
      cat => cat.name.toLowerCase() === newCategoryName.trim().toLowerCase() && cat.id !== editingCategory.id
    );

    if (existingCategory) {
      toast({
        title: "Error",
        description: "Category name already exists",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('expense_categories')
        .update({ 
          name: newCategoryName.trim(),
          updated_at: new Date().toISOString()
        })
        .eq('id', editingCategory.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Expense category updated successfully",
      });

      setEditingCategory(null);
      setNewCategoryName('');
      fetchCategories();
      onCategoriesUpdated?.();
    } catch (error) {
      console.error('Error updating expense category:', error);
      toast({
        title: "Error",
        description: "Failed to update expense category",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const deleteCategory = async (categoryId: string) => {
    if (!confirm('Are you sure you want to delete this expense category?')) return;
    
    setLoading(true);
    try {
      const { error } = await supabase
        .from('expense_categories')
        .update({ is_deleted: true })
        .eq('id', categoryId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Expense category deleted successfully",
      });

      fetchCategories();
      onCategoriesUpdated?.();
    } catch (error) {
      console.error('Error deleting expense category:', error);
      toast({
        title: "Error",
        description: "Failed to delete expense category",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (category: ExpenseCategory) => {
    setEditingCategory(category);
    setNewCategoryName(category.name);
  };

  const cancelEdit = () => {
    setEditingCategory(null);
    setNewCategoryName('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="flex items-center gap-2" disabled={isAllBranchesView}>
          <Settings className="w-4 h-4" />
          Expense Categories
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Expense Categories</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Add/Edit Category Form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {editingCategory ? 'Edit Category' : 'Add New Category'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={editingCategory ? updateCategory : addCategory} className="flex gap-2">
                <div className="flex-1">
                  <Input
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Enter category name"
                    required
                  />
                </div>
                <Button type="submit" disabled={loading}>
                  {editingCategory ? 'Update' : 'Add'}
                </Button>
                {editingCategory && (
                  <Button type="button" variant="outline" onClick={cancelEdit}>
                    Cancel
                  </Button>
                )}
              </form>
            </CardContent>
          </Card>

          {/* Existing Categories */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Existing Categories ({categories.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {categories.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No expense categories found</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {categories.map((category) => (
                    <div key={category.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <h4 className="font-medium">{category.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          Created: {new Date(category.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex gap-1 ml-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startEdit(category)}
                        >
                          <Edit className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => deleteCategory(category.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
};
