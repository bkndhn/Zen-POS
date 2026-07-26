import { supabase } from '@/integrations/supabase/client';

/**
 * Auto-assigns the next sequential Calci Quick Key number (1, 2, 3...) to a newly created item ID.
 */
export async function autoAssignCalciQuickKey(
  newItemId: string,
  adminAuthUid?: string | null,
  branchId?: string | null
) {
  if (!newItemId) return;
  try {
    const key = branchId ? `hotel_pos_calci_shortcodes_${branchId}` : 'hotel_pos_calci_shortcodes';
    const cachedStr = localStorage.getItem(key) || localStorage.getItem('hotel_pos_calci_shortcodes');
    let shortcodes: Record<string, string> = {};
    if (cachedStr) {
      try {
        const parsed = JSON.parse(cachedStr);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          shortcodes = parsed;
        }
      } catch {}
    }

    // Check if already assigned
    const isAlreadyAssigned = Object.values(shortcodes).includes(newItemId);
    if (!isAlreadyAssigned) {
      const usedNums = Object.keys(shortcodes).map(k => parseInt(k)).filter(n => !isNaN(n));
      const nextNum = (usedNums.length ? Math.max(...usedNums) : 0) + 1;
      shortcodes[nextNum.toString()] = newItemId;

      localStorage.setItem(key, JSON.stringify(shortcodes));
      localStorage.setItem('hotel_pos_calci_shortcodes', JSON.stringify(shortcodes));

      if (adminAuthUid) {
        let existingQuery = supabase.from('shop_settings').select('id').eq('user_id', adminAuthUid);
        existingQuery = branchId ? existingQuery.eq('branch_id', branchId) : existingQuery.is('branch_id', null);
        const { data: existing } = await existingQuery.maybeSingle();

        if (existing?.id) {
          await supabase.from('shop_settings').update({ calci_shortcodes: shortcodes }).eq('id', existing.id);
        } else {
          await supabase.from('shop_settings').insert({ calci_shortcodes: shortcodes, user_id: adminAuthUid, branch_id: branchId || null });
        }
      }
      window.dispatchEvent(new Event('shop-settings-updated'));
    }
  } catch (err) {
    console.warn('[CalciQuickKeys] Auto-assign quick key failed:', err);
  }
}

/**
 * Automatically assigns sequential quick key numbers (1, 2, 3...) for all unassigned items in the list.
 */
export async function syncAllMissingCalciQuickKeys(
  allActiveItems: { id: string }[],
  adminAuthUid?: string | null,
  branchId?: string | null
): Promise<Record<string, string>> {
  if (!allActiveItems || !Array.isArray(allActiveItems) || allActiveItems.length === 0) return {};
  try {
    const key = branchId ? `hotel_pos_calci_shortcodes_${branchId}` : 'hotel_pos_calci_shortcodes';
    const cachedStr = localStorage.getItem(key) || localStorage.getItem('hotel_pos_calci_shortcodes');
    let shortcodes: Record<string, string> = {};
    if (cachedStr) {
      try {
        const parsed = JSON.parse(cachedStr);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          shortcodes = parsed;
        }
      } catch {}
    }

    const assignedIds = new Set(Object.values(shortcodes));
    let changed = false;

    allActiveItems.forEach(item => {
      if (item?.id && !assignedIds.has(item.id)) {
        const usedNums = Object.keys(shortcodes).map(k => parseInt(k)).filter(n => !isNaN(n));
        const nextNum = (usedNums.length ? Math.max(...usedNums) : 0) + 1;
        shortcodes[nextNum.toString()] = item.id;
        assignedIds.add(item.id);
        changed = true;
      }
    });

    if (changed) {
      localStorage.setItem(key, JSON.stringify(shortcodes));
      localStorage.setItem('hotel_pos_calci_shortcodes', JSON.stringify(shortcodes));

      if (adminAuthUid) {
        let existingQuery = supabase.from('shop_settings').select('id').eq('user_id', adminAuthUid);
        existingQuery = branchId ? existingQuery.eq('branch_id', branchId) : existingQuery.is('branch_id', null);
        const { data: existing } = await existingQuery.maybeSingle();

        if (existing?.id) {
          await supabase.from('shop_settings').update({ calci_shortcodes: shortcodes }).eq('id', existing.id);
        } else {
          await supabase.from('shop_settings').insert({ calci_shortcodes: shortcodes, user_id: adminAuthUid, branch_id: branchId || null });
        }
      }
      window.dispatchEvent(new Event('shop-settings-updated'));
    }

    return shortcodes;
  } catch (err) {
    console.warn('[CalciQuickKeys] Sync missing quick keys failed:', err);
    return {};
  }
}
