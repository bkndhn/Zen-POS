import React, { useState } from 'react';
import { useBranch } from '@/contexts/BranchContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Building2, Plus, Pencil, Check, X, Star } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';

/**
 * Admin-only Settings card to manage branches.
 * - Shows current branches.
 * - "Add Branch" enforced server-side via max_branches trigger.
 * - Rename branch.
 * - Cannot delete Main branch (server-enforced).
 */
export const BranchManagement: React.FC = () => {
  const { profile } = useAuth();
  const { branches, maxBranches, refresh } = useBranch();
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  if (profile?.role !== 'admin') return null;

  const adminId = profile.id;
  const usedCount = branches.length;
  const canAdd = usedCount < maxBranches;

  const handleAdd = async () => {
    if (usedCount >= maxBranches) {
      toast({
        title: '⚠️ Branch Limit Reached',
        description: `Your subscription is restricted to a maximum of ${maxBranches} branch(es). You currently have ${usedCount} active branch(es). Please contact Super Admin to upgrade your limit.`,
        variant: 'destructive',
      });
      return;
    }
    const name = newName.trim();
    if (!name) {
      toast({ title: 'Name required', variant: 'destructive' });
      return;
    }
    setAdding(true);
    try {
      const { data: created, error } = await supabase.from('branches').insert({
        admin_id: adminId,
        name,
        code: name.substring(0, 6).toUpperCase().replace(/\s+/g, ''),
        is_active: true,
        is_main: false,
        shop_name: name,
      }).select().single();
      if (error) throw error;

      // Seed default categories/payments/charges/taxes from Main branch (or admin defaults)
      if (created?.id) {
        const mainBranchId = branches.find(b => b.is_main)?.id || null;
        const { error: seedErr } = await (supabase as any).rpc('seed_branch_defaults', {
          p_target_branch_id: created.id,
          p_source_branch_id: mainBranchId,
        });
        if (seedErr) console.warn('Branch defaults seeding failed:', seedErr);
      }

      toast({ title: 'Branch created', description: `${name} ready with default settings` });
      setNewName('');
      setAddOpen(false);
      await refresh();
    } catch (err: any) {
      toast({
        title: 'Could not create branch',
        description: err?.message || 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setAdding(false);
    }
  };

  const handleRename = async (id: string) => {
    const name = editName.trim();
    if (!name) return;
    setSavingEdit(true);
    try {
      const { error } = await supabase
        .from('branches')
        .update({ name, shop_name: name })
        .eq('id', id);
      if (error) throw error;
      toast({ title: 'Branch renamed' });
      setEditingId(null);
      setEditName('');
      await refresh();
    } catch (err: any) {
      toast({ title: 'Rename failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Building2 className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="text-base sm:text-lg">Branches</span>
          </span>
          <Badge variant={!canAdd ? 'destructive' : 'outline'} className="text-xs">
            {usedCount} / {maxBranches} used
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 sm:p-6 space-y-3">
        {!canAdd ? (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-xl text-rose-800 dark:text-rose-300 text-xs font-semibold flex items-center gap-2">
            <span className="font-bold">⚠️ Branch Limit Reached:</span> Your account is limited to {maxBranches} branch(es) ({usedCount}/{maxBranches} active). Contact Super Admin to upgrade your limit.
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Each branch keeps its own bills, stock, kitchen, and reports. Switch branches from the top bar.
          </p>
        )}

        <div className="space-y-2">
          {branches.map((b) => (
            <div
              key={b.id}
              className="flex items-center justify-between gap-2 p-3 rounded-lg border bg-muted/30"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {b.is_main ? (
                  <Star className="w-4 h-4 text-amber-500 shrink-0" />
                ) : (
                  <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
                {editingId === b.id ? (
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-8 text-sm"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && handleRename(b.id)}
                  />
                ) : (
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{b.name}</div>
                    {b.is_main && (
                      <div className="text-[10px] text-muted-foreground">Default branch (cannot be deleted)</div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
                {editingId === b.id ? (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={() => handleRename(b.id)}
                      disabled={savingEdit}
                    >
                      <Check className="w-4 h-4 text-green-600" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={() => { setEditingId(null); setEditName(''); }}
                      disabled={savingEdit}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0"
                    onClick={() => { setEditingId(b.id); setEditName(b.name); }}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        <Button
          onClick={() => setAddOpen(true)}
          disabled={!canAdd}
          variant="outline"
          className="w-full"
          size="sm"
        >
          <Plus className="w-4 h-4 mr-2" /> Add Branch
        </Button>
      </CardContent>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add a new branch</DialogTitle>
            <DialogDescription>
              You can rename it later. Each branch will have isolated data (bills, stock, reports).
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="e.g. Branch 2 / Anna Nagar"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={adding}>Cancel</Button>
            <Button onClick={handleAdd} disabled={adding || !newName.trim()}>
              {adding ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
