import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface Branch {
  id: string;
  admin_id: string;
  name: string;
  code: string | null;
  is_main: boolean;
  is_active: boolean;
  shop_name: string | null;
  address: string | null;
  contact_number: string | null;
  gstin: string | null;
  gst_enabled: boolean | null;
  logo_url: string | null;
  menu_slug: string | null;
}

interface BranchContextType {
  branches: Branch[];
  /** The branch currently being viewed. null = "All Branches" view (admin only). */
  activeBranch: Branch | null;
  /** True when admin chooses "All Branches" combined view. */
  isAllBranchesView: boolean;
  /** The branch_id used for inserts/operations. Falls back to Main if All-view. */
  operatingBranchId: string | null;
  loading: boolean;
  setActiveBranchId: (id: string | null) => void;
  refresh: () => Promise<void>;
  maxBranches: number;
}

const BranchContext = createContext<BranchContextType | undefined>(undefined);

const STORAGE_KEY_PREFIX = 'hotel_pos_active_branch_';

export const BranchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile , adminProfileId } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranch, setActiveBranch] = useState<Branch | null>(null);
  const [isAllBranchesView, setIsAllBranchesView] = useState(false);
  const [loading, setLoading] = useState(true);
  const [maxBranches, setMaxBranches] = useState(1);

  const adminId = adminProfileId;

  const fetchBranches = useCallback(async () => {
    if (!profile || !adminId) {
      setBranches([]);
      setActiveBranch(null);
      setLoading(false);
      return;
    }

    try {
      const [{ data: branchData }, { data: profileData }, { data: assignedData }] = await Promise.all([
        supabase
          .from('branches')
          .select('*')
          .eq('admin_id', adminId)
          .eq('is_active', true)
          .order('is_main', { ascending: false })
          .order('created_at', { ascending: true }),
        supabase
          .from('profiles')
          .select('max_branches')
          .eq('id', adminId)
          .maybeSingle(),
        // For sub-users, restrict to assigned branches only
        profile.role === 'user'
          ? supabase.from('user_branches').select('branch_id').eq('user_id', profile.user_id)
          : Promise.resolve({ data: null } as any),
      ]);

      let list = (branchData || []) as Branch[];

      // Sub-user branch restriction: only show branches they're assigned to
      if (profile.role === 'user' && Array.isArray(assignedData)) {
        const allowed = new Set((assignedData as any[]).map(r => r.branch_id));
        list = list.filter(b => allowed.has(b.id));
      }

      setBranches(list);
      setMaxBranches((profileData as any)?.max_branches ?? 1);

      // Determine active branch from localStorage or default to Main
      const storedKey = `${STORAGE_KEY_PREFIX}${profile.user_id}`;
      const stored = localStorage.getItem(storedKey);

      if (stored === '__all__' && profile.role === 'admin') {
        setIsAllBranchesView(true);
        setActiveBranch(null);
      } else {
        const found = stored ? list.find(b => b.id === stored) : null;
        const main = list.find(b => b.is_main) || list[0] || null;
        setActiveBranch(found || main);
        setIsAllBranchesView(false);
      }
    } catch (err) {
      console.error('Failed to fetch branches', err);
    } finally {
      setLoading(false);
    }
  }, [profile, adminId]);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  const setActiveBranchId = useCallback((id: string | null) => {
    if (!profile) return;
    const storageKey = `${STORAGE_KEY_PREFIX}${profile.user_id}`;

    if (id === null) {
      // "All Branches" view (admin only)
      if (profile.role !== 'admin') return;
      localStorage.setItem(storageKey, '__all__');
      setIsAllBranchesView(true);
      setActiveBranch(null);
    } else {
      const found = branches.find(b => b.id === id);
      if (found) {
        localStorage.setItem(storageKey, id);
        setActiveBranch(found);
        setIsAllBranchesView(false);
      }
    }
    // Notify pages to refetch their data
    window.dispatchEvent(new CustomEvent('branch-changed', { detail: id }));
  }, [profile, branches]);

  const operatingBranchId = activeBranch?.id
    || branches.find(b => b.is_main)?.id
    || branches[0]?.id
    || null;

  return (
    <BranchContext.Provider
      value={{
        branches,
        activeBranch,
        isAllBranchesView,
        operatingBranchId,
        loading,
        setActiveBranchId,
        refresh: fetchBranches,
        maxBranches,
      }}
    >
      {children}
    </BranchContext.Provider>
  );
};

export const useBranch = (): BranchContextType => {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error('useBranch must be used within BranchProvider');
  return ctx;
};
