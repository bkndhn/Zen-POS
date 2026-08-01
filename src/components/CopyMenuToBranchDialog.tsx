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
  businessType?: string;
}

/**
 * Lets the admin copy ALL items from the current branch into another branch.
 * Stock starts at 0 in the target branch (each branch tracks its own stock).
 */
export const CopyMenuToBranchDialog: React.FC<CopyMenuToBranchDialogProps> = ({
  sourceBranchId,
  onCopied,
  businessType,
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
        title: `${businessType === 'retail' || businessType === 'pharmacy' ? 'Catalog' : 'Menu'} copied`,
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

  if (candidates.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={!sourceBranchId}
          title={!sourceBranchId ? 'Switch to a specific branch first' : `Copy this branch ${businessType === 'retail' || businessType === 'pharmacy' ? 'catalog' : 'menu'} to another`}
        >
          <Copy className="w-3.5 h-3.5 mr-1" />
          {businessType === 'retail' || businessType === 'pharmacy' ? 'Copy catalog' : 'Copy menu'}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-4 h-4" /> Copy {businessType === 'retail' || businessType === 'pharmacy' ? 'catalog' : 'menu'} to another branch
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
