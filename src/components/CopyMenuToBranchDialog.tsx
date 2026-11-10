import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Copy, Building2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useBranch } from '@/contexts/BranchContext';

interface CopyMenuToBranchDialogProps {
  /** Source branch (the branch we're currently viewing). */
  sourceBranchId: string | null;
  onCopied?: () => void;
}

/**
 * Lets the admin copy ALL items from the current branch into another branch.
 * Stock starts at 0 in the target branch (each branch tracks its own stock).
 */
export const CopyMenuToBranchDialog: React.FC<CopyMenuToBranchDialogProps> = ({
  sourceBranchId,
  onCopied,

}) => {
  const { branches } = useBranch();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const candidates = branches.filter(b => b.id !== sourceBranchId);

  const handleCopy = async () => {
    if (!sourceBranchId || !target) {
      toast({ title: 'Pick a target branch', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await (supabase as any).rpc('copy_items_to_branch', {
        p_source_branch_id: sourceBranchId,
        p_target_branch_id: target,
        p_item_ids: null,
      });
      if (error) throw error;
      toast({
        title: 'Menu copied',
        description: `${data ?? 0} items copied to the target branch (stock starts at 0).`,
      });
      setOpen(false);
      setTarget('');
      onCopied?.();
    } catch (err: any) {
      toast({
        title: 'Copy failed',
        description: err?.message || 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  /**
   * Master-menu push: take every item's price/availability from this branch
   * and apply it to the same-named item in every other branch. RLS keeps the
   * update inside the owner's own shop.
   */
  const handlePushAll = async () => {
    if (!sourceBranchId) return;
    if (!window.confirm(`Push prices and on/off status from this branch to all ${candidates.length} other branches?`)) return;
    setBusy(true);
    try {
      const { data: src, error } = await (supabase as any)
        .from('items')
        .select('name, price, is_active')
        .eq('branch_id', sourceBranchId);
      if (error) throw error;
      const rows = (src || []) as { name: string; price: number; is_active: boolean }[];
      const targetIds = candidates.map(b => b.id);
      let updated = 0;
      for (let i = 0; i < rows.length; i += 8) {
        const chunk = rows.slice(i, i + 8);
        const results = await Promise.all(chunk.map(r =>
          (supabase as any)
            .from('items')
            .update({ price: r.price, is_active: r.is_active })
            .eq('name', r.name)
            .in('branch_id', targetIds)
            .select('id')
        ));
        results.forEach((res: any) => { if (!res.error) updated += res.data?.length || 0; });
      }
      toast({ title: 'Pushed to all branches', description: `${updated} branch items updated from ${rows.length} items.` });
      setOpen(false);
      onCopied?.();
    } catch (err: any) {
      toast({ title: 'Push failed', description: err?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  if (candidates.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={!sourceBranchId}
          title={!sourceBranchId ? 'Switch to a specific branch first' : 'Copy this branch menu to another'}
        >
          <Copy className="w-3.5 h-3.5 mr-1" />
          Copy menu
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-4 h-4" /> Copy menu to another branch
          </DialogTitle>
          <DialogDescription>
            Items will be duplicated into the target branch. Stock starts at 0 — set it from the target branch.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label className="text-xs">Target branch</Label>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger>
              <SelectValue placeholder="Select target branch..." />
            </SelectTrigger>
            <SelectContent>
              {candidates.map(b => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            Edited prices here? Push this branch's prices and on/off status to every other branch in one tap (matched by item name).
          </p>
          <Button variant="secondary" className="w-full" onClick={handlePushAll} disabled={busy}>
            Push prices to all {candidates.length} branches
          </Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button onClick={handleCopy} disabled={busy || !target}>
            {busy ? 'Copying...' : 'Copy items'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
