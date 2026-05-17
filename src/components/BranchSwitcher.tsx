import React from 'react';
import { useBranch } from '@/contexts/BranchContext';
import { useAuth } from '@/contexts/AuthContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2, Layers } from 'lucide-react';

/**
 * Branch switcher shown in the Header.
 * - Admins: can pick a branch OR "All Branches" combined view.
 * - Sub-users: can only see/use the active branch (no switcher rendered if only 1 branch).
 * - Super admin: not rendered.
 */
export const BranchSwitcher: React.FC = () => {
  const { profile } = useAuth();
  const { branches, activeBranch, isAllBranchesView, setActiveBranchId, loading } = useBranch();

  if (!profile || profile.role === 'super_admin') return null;
  if (loading) return null;
  if (branches.length === 0) return null;
  // Hide switcher entirely if only one branch and user is sub-user
  if (branches.length === 1 && profile.role !== 'admin') return null;
  // Hide if only one branch (no choice to make)
  if (branches.length === 1) return null;

  const isAdmin = profile.role === 'admin';
  const value = isAllBranchesView ? '__all__' : (activeBranch?.id || '');

  return (
    <Select
      value={value}
      onValueChange={(v) => setActiveBranchId(v === '__all__' ? null : v)}
    >
      <SelectTrigger className="h-9 w-[140px] sm:w-[170px] text-xs">
        <div className="flex items-center gap-1.5 min-w-0">
          {isAllBranchesView ? (
            <Layers className="w-3.5 h-3.5 shrink-0 text-primary" />
          ) : (
            <Building2 className="w-3.5 h-3.5 shrink-0 text-primary" />
          )}
          <SelectValue placeholder="Branch" />
        </div>
      </SelectTrigger>
      <SelectContent>
        {isAdmin && (
          <SelectItem value="__all__">
            <span className="flex items-center gap-2">
              <Layers className="w-3.5 h-3.5" /> All Branches
            </span>
          </SelectItem>
        )}
        {branches.map((b) => (
          <SelectItem key={b.id} value={b.id}>
            <span className="flex items-center gap-2">
              <Building2 className="w-3.5 h-3.5" />
              {b.name}{b.is_main && <span className="text-[10px] text-muted-foreground">(Main)</span>}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
