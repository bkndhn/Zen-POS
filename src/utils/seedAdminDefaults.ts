/**
 * Seeds default data (categories, payment types) for a new admin.
 * Called once when an admin first logs in and has no data.
 */
import { supabase } from '@/integrations/supabase/client';

const DEFAULT_ITEM_CATEGORIES = ['Food', 'Beverages', 'Snacks'];
const DEFAULT_EXPENSE_CATEGORIES = ['Rent', 'Utilities', 'Salaries', 'Supplies', 'Maintenance', 'Other'];
const DEFAULT_PAYMENT_TYPES = [
  { payment_type: 'Cash', is_default: true, is_disabled: false },
  { payment_type: 'UPI', is_default: false, is_disabled: false },
  { payment_type: 'Card', is_default: false, is_disabled: false },
];

export const seedAdminDefaults = async (adminProfileId: string) => {
  try {
    // Check if admin already has item categories (skip seeding if so)
    const { data: existingItemCats } = await supabase
      .from('item_categories')
      .select('id')
      .eq('admin_id', adminProfileId)
      .limit(1);

    if (existingItemCats && existingItemCats.length > 0) {
      console.log('[Seed] Admin already has data, skipping seeding');
      return;
    }

    // Get the Main branch for this admin
    const { data: mainBranch } = await supabase
      .from('branches')
      .select('id')
      .eq('admin_id', adminProfileId)
      .eq('is_main', true)
      .limit(1)
      .single();

    const branchId = mainBranch?.id || null;

    console.log('[Seed] Seeding default data for admin:', adminProfileId, 'Branch:', branchId);

    // Seed item categories
    const itemCats = DEFAULT_ITEM_CATEGORIES.map(name => ({
      name,
      admin_id: adminProfileId,
      branch_id: branchId,
      is_deleted: false,
    }));
    await supabase.from('item_categories').insert(itemCats);

    // Seed expense categories
    const expenseCats = DEFAULT_EXPENSE_CATEGORIES.map(name => ({
      name,
      admin_id: adminProfileId,
      branch_id: branchId,
      is_deleted: false,
    }));
    await supabase.from('expense_categories').insert(expenseCats);

    // Seed payment types (only ones that do not exist yet)
    const { data: existingPayments } = await supabase
      .from('payments')
      .select('payment_type')
      .eq('admin_id', adminProfileId)
      .eq('branch_id', branchId);

    const existingNames = new Set((existingPayments || []).map(p => p.payment_type.toLowerCase().trim()));
    const paymentsToSeed = DEFAULT_PAYMENT_TYPES
      .filter(p => !existingNames.has(p.payment_type.toLowerCase().trim()))
      .map(p => ({
        ...p,
        admin_id: adminProfileId,
        branch_id: branchId,
      }));

    if (paymentsToSeed.length > 0) {
      await supabase.from('payments').insert(paymentsToSeed);
    }

    console.log('[Seed] Default data seeded successfully');
  } catch (error) {
    console.error('[Seed] Error seeding defaults:', error);
    // Non-critical - don't block login
  }
};
