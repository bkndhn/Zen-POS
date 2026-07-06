import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { Settings, Edit, Trash2 } from 'lucide-react';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ItemCategory {
  id: string;
  name: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  branch_id: string | null;
  print_station: string | null;
}

const STATION_PRESETS = ['kitchen', 'bar', 'dessert'];

interface ItemCategoryManagementProps {
  onCategoriesUpdated?: () => void;
}

export const ItemCategoryManagement: React.FC<ItemCategoryManagementProps> = ({ onCategoriesUpdated }) => {
  const { profile } = useAuth();
  const { operatingBranchId, activeBranch, isAllBranchesView } = useBranch();
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<ItemCategory[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newStation, setNewStation] = useState<string>('kitchen');
  const [editingCategory, setEditingCategory] = useState<ItemCategory | null>(null);
  const [loading, setLoading] = useState(false);

  const adminId = profile?.role === 'admin' ? profile?.id : profile?.admin_id;

  useEffect(() => {
    if (open) fetchCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, operatingBranchId, adminId]);

  const fetchCategories = async () => {
    try {
      if (!adminId) { setCategories([]); return; }
      let query = supabase
        .from('item_categories')
        .select('*')
        .eq('admin_id', adminId)
        .eq('is_deleted', false);
      if (operatingBranchId) query = query.eq('branch_id', operatingBranchId);
      const { data, error } = await query.order('name');
      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error('Error fetching item categories:', error);
      toast({ title: 'Error', description: 'Failed to fetch item categories', variant: 'destructive' });
    }
  };

  const addCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    if (!adminId || !operatingBranchId) {
      toast({ title: 'Error', description: 'Select a branch before adding categories', variant: 'destructive' });
      return;
    }

    const dup = categories.find(c => c.name.toLowerCase() === newCategoryName.trim().toLowerCase());
    if (dup) {
      toast({ title: 'Error', description: 'Category already exists in this branch', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const { error } = await (supabase as any)
        .from('item_categories')
        .insert([{ name: newCategoryName.trim(), admin_id: adminId, branch_id: operatingBranchId, print_station: (newStation || 'kitchen').trim().toLowerCase() }]);
      if (error) throw error;
      toast({ title: 'Success', description: 'Item category added' });
      setNewCategoryName('');
      setNewStation('kitchen');
      fetchCategories();
      onCategoriesUpdated?.();
    } catch (error: any) {
      console.error('Error adding item category:', error);
      toast({ title: 'Error', description: error?.message || 'Failed to add item category', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const updateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory || !newCategoryName.trim()) return;
    const dup = categories.find(c =>
      c.name.toLowerCase() === newCategoryName.trim().toLowerCase() && c.id !== editingCategory.id
    );
    if (dup) {
      toast({ title: 'Error', description: 'Category name already exists', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase
        .from('item_categories')
        .update({ name: newCategoryName.trim(), updated_at: new Date().toISOString() })
        .eq('id', editingCategory.id);
      if (error) throw error;
      toast({ title: 'Success', description: 'Item category updated' });
      setEditingCategory(null);
      setNewCategoryName('');
      fetchCategories();
      onCategoriesUpdated?.();
    } catch (error: any) {
      console.error('Error updating item category:', error);
      toast({ title: 'Error', description: error?.message || 'Failed to update category', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const deleteCategory = async (categoryId: string) => {
    if (!confirm('Delete this item category?')) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('item_categories')
        .update({ is_deleted: true })
        .eq('id', categoryId);
      if (error) throw error;
      toast({ title: 'Success', description: 'Item category deleted' });
      fetchCategories();
      onCategoriesUpdated?.();
    } catch (error) {
      console.error('Error deleting item category:', error);
      toast({ title: 'Error', description: 'Failed to delete category', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (c: ItemCategory) => { setEditingCategory(c); setNewCategoryName(c.name); };
  const cancelEdit = () => { setEditingCategory(null); setNewCategoryName(''); };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="flex items-center gap-2">
          <Settings className="w-4 h-4" />
          Item Categories
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Manage Item Categories
            {activeBranch && <span className="text-sm font-normal text-muted-foreground ml-2">— {activeBranch.name}</span>}
          </DialogTitle>
        </DialogHeader>

        {isAllBranchesView ? (
          <div className="p-6 text-sm text-muted-foreground text-center">
            Switch to a specific branch to manage its item categories.
          </div>
        ) : (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{editingCategory ? 'Edit Category' : 'Add New Category'}</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={editingCategory ? updateCategory : addCategory} className="flex gap-2">
                  <Input
                    className="flex-1"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Enter category name"
                    required
                  />
                  <Button type="submit" disabled={loading}>{editingCategory ? 'Update' : 'Add'}</Button>
                  {editingCategory && <Button type="button" variant="outline" onClick={cancelEdit}>Cancel</Button>}
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Existing Categories ({categories.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {categories.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">No item categories in this branch</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {categories.map((c) => (
                      <div key={c.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex-1">
                          <h4 className="font-medium">{c.name}</h4>
                          <p className="text-sm text-muted-foreground">
                            Created: {new Date(c.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex gap-1 ml-2">
                          <Button size="sm" variant="outline" onClick={() => startEdit(c)}><Edit className="w-3 h-3" /></Button>
                          <Button size="sm" variant="outline" onClick={() => deleteCategory(c.id)} className="text-destructive hover:text-destructive">
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
        )}
      </DialogContent>
    </Dialog>
  );
};
