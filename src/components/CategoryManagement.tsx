import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Plus, Edit, Trash2, FolderPlus } from 'lucide-react';
import { cachedFetch, CACHE_KEYS, dataCache } from '@/utils/cacheUtils';

interface Category {
  id: string;
  name: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

interface CategoryManagementProps {
  onCategoriesUpdated?: () => void;
}

export const CategoryManagement: React.FC<CategoryManagementProps> = ({ onCategoriesUpdated }) => {
  const { profile , adminProfileId } = useAuth();
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      fetchCategories();
    }
  }, [open]);

  const fetchCategories = async () => {
    try {
      const data = await cachedFetch(
        CACHE_KEYS.CATEGORIES,
        async () => {
          const { data, error } = await supabase
            .from('expense_categories')
            .select('*')
            .eq('is_deleted', false)
            .order('name');

          if (error) throw error;
          return data || [];
        }
      );
      setCategories(data);
    } catch (error) {
      console.error('Error fetching categories:', error);
      toast({
        title: "Error",
        description: "Failed to fetch categories",
        variant: "destructive",
      });
    }
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) {
      toast({
        title: "Error",
        description: "Category name is required",
        variant: "destructive",
      });
      return;
    }

    // Check for duplicates
    const duplicate = categories.find(
      cat => cat.name.toLowerCase() === newCategoryName.trim().toLowerCase() && !cat.is_deleted
    );
    
    if (duplicate) {
      toast({
        title: "Error",
        description: "Category already exists",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Get admin_id for data isolation
      const adminId = adminProfileId;

      const { error } = await supabase
        .from('expense_categories')
        .insert({ 
          name: newCategoryName.trim(),
          is_deleted: false,
          admin_id: adminId || null
        });

      if (error) throw error;

      // Invalidate cache
      dataCache.invalidatePattern(CACHE_KEYS.CATEGORIES);

      toast({
        title: "Success",
        description: "Category added successfully",
      });

      setNewCategoryName('');
      fetchCategories();
      onCategoriesUpdated?.();
    } catch (error) {
      console.error('Error adding category:', error);
      toast({
        title: "Error",
        description: "Failed to add category",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEditCategory = async () => {
    if (!editingCategory || !newCategoryName.trim()) {
      toast({
        title: "Error",
        description: "Category name is required",
        variant: "destructive",
      });
      return;
    }

    // Check for duplicates (excluding current category)
    const duplicate = categories.find(
      cat => cat.name.toLowerCase() === newCategoryName.trim().toLowerCase() && 
      !cat.is_deleted && 
      cat.id !== editingCategory.id
    );
    
    if (duplicate) {
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
        .update({ name: newCategoryName.trim() })
        .eq('id', editingCategory.id);

      if (error) throw error;

      // Invalidate cache
      dataCache.invalidatePattern(CACHE_KEYS.CATEGORIES);

      toast({
        title: "Success",
        description: "Category updated successfully",
      });

      setEditingCategory(null);
      setNewCategoryName('');
      fetchCategories();
      onCategoriesUpdated?.();
    } catch (error) {
      console.error('Error updating category:', error);
      toast({
        title: "Error",
        description: "Failed to update category",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCategory = async (categoryId: string, categoryName: string) => {
    try {
      const { error } = await supabase
        .from('expense_categories')
        .update({ is_deleted: true })
        .eq('id', categoryId);

      if (error) throw error;

      // Invalidate cache
      dataCache.invalidatePattern(CACHE_KEYS.CATEGORIES);

      toast({
        title: "Success",
        description: `Category "${categoryName}" deleted successfully`,
      });

      fetchCategories();
      onCategoriesUpdated?.();
    } catch (error) {
      console.error('Error deleting category:', error);
      toast({
        title: "Error",
        description: "Failed to delete category",
        variant: "destructive",
      });
    }
  };

  const startEdit = (category: Category) => {
    setEditingCategory(category);
    setNewCategoryName(category.name);
  };

  const cancelEdit = () => {
    setEditingCategory(null);
    setNewCategoryName('');
  };

  const activeCategories = categories.filter(cat => !cat.is_deleted);
  const inactiveCategories = categories.filter(cat => cat.is_deleted);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FolderPlus className="w-4 h-4 mr-2" />
          Add Category
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Categories</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Add/Edit Form */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">
                {editingCategory ? 'Edit Category' : 'Add New Category'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="category-name">Category Name</Label>
                <Input
                  id="category-name"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Enter category name"
                />
              </div>
              <div className="flex gap-2">
                {editingCategory ? (
                  <>
                    <Button onClick={handleEditCategory} disabled={loading} size="sm">
                      Save
                    </Button>
                    <Button variant="outline" onClick={cancelEdit} size="sm">
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button onClick={handleAddCategory} disabled={loading} size="sm">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Category
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Active Categories */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Active Categories ({activeCategories.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {activeCategories.length === 0 ? (
                <p className="text-muted-foreground text-center py-4 text-sm">
                  No active categories found
                </p>
              ) : (
                <div className="space-y-2">
                  {activeCategories.map((category) => (
                    <div key={category.id} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                      <span className="font-medium">{category.name}</span>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startEdit(category)}
                          className="h-8 w-8 p-0"
                        >
                          <Edit className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeleteCategory(category.id, category.name)}
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
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

          {/* Inactive Categories */}
          {inactiveCategories.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Inactive Categories ({inactiveCategories.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {inactiveCategories.map((category) => (
                    <div key={category.id} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                      <span className="font-medium text-muted-foreground line-through">{category.name}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
