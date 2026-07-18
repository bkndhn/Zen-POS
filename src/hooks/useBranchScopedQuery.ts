import { useEffect, useRef } from 'react';
import { useBranch } from '@/contexts/BranchContext';

/**
 * Hook that returns the current branch filter context for queries.
 *
 * Behavior:
 * - When admin is in "All Branches" view, `branchFilterId` is null (don't filter).
 * - Otherwise, `branchFilterId` is the active branch id and queries should filter by it.
 * - `operatingBranchId` is what to write into new records (inserts).
 * - `readOnly` is true when in All-Branches view.
 *
 * Pass an `onChange` callback to refetch data when the user switches branches.
 * The callback is invoked AFTER React re-renders with the new branchFilterId,
 * so closures inside it will see the updated value.
 */
export function useBranchScopedQuery(onChange?: () => void) {
  const {
    activeBranch,
    isAllBranchesView,
    operatingBranchId,
    branches,
    loading,
  } = useBranch();

  const branchFilterId = isAllBranchesView ? null : (activeBranch?.id ?? null);

  // Keep latest callback in ref so we always call the freshest closure
  const cbRef = useRef(onChange);
  useEffect(() => {
    cbRef.current = onChange;
  });

  // Track first render — skip the initial fire (pages do their own initial fetch)
  const isFirst = useRef(true);
  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    // Branch (or All-view) changed → tell the page to refetch.
    // This runs AFTER render, so the page's fetch closure now sees the new branchFilterId.
    cbRef.current?.();
     
  }, [branchFilterId, isAllBranchesView]);

  return {
    /** Use this in `.eq('branch_id', ...)` filters. null = All Branches (don't filter). */
    branchFilterId,
    /** Use this when inserting new records. Falls back to Main branch. */
    operatingBranchId,
    /** True when admin selected "All Branches" — UI should disable inserts/updates. */
    readOnly: isAllBranchesView,
    isAllBranchesView,
    activeBranch,
    branches,
    loading,
  };
}

/**
 * Helper: apply branch filter to a Supabase query builder if a branch is selected.
 */
export function applyBranchFilter<T>(query: T, branchFilterId: string | null): T {
  if (!branchFilterId) return query;
  // @ts-ignore - supabase query builder has chainable .eq
  return query.eq('branch_id', branchFilterId);
}
