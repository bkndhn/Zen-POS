import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';

/**
 * useBranchSettings
 * --------------------------------
 * One-stop hook for any component that reads/writes a per-branch settings
 * row keyed by (user_id, branch_id). Handles:
 *   - Loading the row for the currently-active branch
 *   - Falling back to the Main-branch row when the current branch has no row yet
 *     (so brand-new sub-branches inherit Main values until edited)
 *   - Refetching automatically when the user switches branches
 *   - Upserting against the (user_id, branch_id) unique index so saves
 *     stay isolated to the current branch
 *
 * @param table  Supabase table name. Must have user_id + branch_id columns.
 * @param select Columns to select (defaults to '*')
 */
export function useBranchSettings<T extends Record<string, any>>(
  table: 'shop_settings' | 'bluetooth_settings' | 'display_settings' | 'user_preferences',
  select: string = '*'
) {
  const { profile } = useAuth();
  const { operatingBranchId, branches } = useBranch();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const userId = profile?.user_id ?? null;
  const branchId = operatingBranchId ?? null;
  const mainBranchId = branches.find((b) => b.is_main)?.id ?? null;

  const fetchedFor = useRef<string>('');

  const fetchRow = useCallback(async () => {
    if (!userId || !branchId) {
      setData(null);
      setLoading(false);
      return;
    }
    const key = `${userId}:${branchId}`;
    fetchedFor.current = key;
    setLoading(true);
    try {
      // 1) Try the row for current branch
      const { data: row } = await (supabase as any)
        .from(table)
        .select(select)
        .eq('user_id', userId)
        .eq('branch_id', branchId)
        .maybeSingle();

      if (row) {
        if (fetchedFor.current === key) setData(row as T);
      } else if (mainBranchId && mainBranchId !== branchId) {
        // 2) Fall back to Main branch row (inheritance for empty branches)
        const { data: mainRow } = await (supabase as any)
          .from(table)
          .select(select)
          .eq('user_id', userId)
          .eq('branch_id', mainBranchId)
          .maybeSingle();
        if (fetchedFor.current === key) setData((mainRow as T) ?? null);
      } else {
        if (fetchedFor.current === key) setData(null);
      }
    } finally {
      if (fetchedFor.current === key) setLoading(false);
    }
  }, [userId, branchId, mainBranchId, table, select]);

  useEffect(() => {
    fetchRow();
  }, [fetchRow]);

  /**
   * Save (upsert) the partial values for the CURRENT branch only.
   * Always sets user_id + branch_id so it can never spill into another branch.
   */
  const save = useCallback(
    async (values: Partial<T>): Promise<{ error: any }> => {
      if (!userId || !branchId) return { error: new Error('No user or branch') };
      setSaving(true);
      try {
        // Find existing row id for this (user, branch)
        const { data: existing } = await (supabase as any)
          .from(table)
          .select('id')
          .eq('user_id', userId)
          .eq('branch_id', branchId)
          .maybeSingle();

        let error: any = null;
        if (existing?.id) {
          ({ error } = await (supabase as any)
            .from(table)
            .update({ ...values, updated_at: new Date().toISOString() })
            .eq('id', existing.id));
        } else {
          ({ error } = await (supabase as any)
            .from(table)
            .insert({
              ...values,
              user_id: userId,
              branch_id: branchId,
            }));
        }
        if (!error) {
          // Refresh local cache
          await fetchRow();
        }
        return { error };
      } finally {
        setSaving(false);
      }
    },
    [userId, branchId, table, fetchRow]
  );

  return { data, loading, saving, save, refetch: fetchRow, branchId, userId };
}
