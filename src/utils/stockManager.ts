import { supabase } from '@/integrations/supabase/client';
import { convertToInventoryUnit } from '@/utils/timeUtils';

export interface StockDeductionItem {
  id: string;
  name: string;
  quantity: number;
  unit?: string;
  selling_unit?: string;
  inventory_unit?: string;
}

/**
 * Deducts stock for a list of billed items.
 * Checks for recipes and deducts raw ingredients if available.
 * Falls back to deducting standard menu item stock if no recipe is found.
 */
export const deductStockForItems = async (items: StockDeductionItem[]) => {
  const stockUpdatePromises = items.map(async (item) => {
    try {
      // Query if there is a recipe defined for this item
      const { data: recipeParts, error: recipeErr } = await supabase
        .from('recipes')
        .select('ingredient_id, quantity')
        .eq('item_id', item.id);

      if (!recipeErr && recipeParts && recipeParts.length > 0) {
        // Recipe exists: Deduct each ingredient's stock
        for (const part of recipeParts) {
          try {
            const { data: currentIng } = await supabase
              .from('ingredients')
              .select('stock_quantity')
              .eq('id', part.ingredient_id)
              .single();

            if (currentIng) {
              const totalDeduction = Number(part.quantity) * Number(item.quantity);
              const newStock = Math.max(0, (Number(currentIng.stock_quantity) || 0) - totalDeduction);
              await supabase
                .from('ingredients')
                .update({ stock_quantity: newStock })
                .eq('id', part.ingredient_id);
            }
          } catch (ingErr) {
            console.error(`Failed to deduct ingredient ${part.ingredient_id} for item ${item.name}:`, ingErr);
          }
        }
      } else {
        // Fallback: Deduct standard menu item stock
        const { data: currentItem } = await supabase
          .from('items')
          .select('stock_quantity')
          .eq('id', item.id)
          .single();

        if (currentItem && currentItem.stock_quantity !== null && currentItem.stock_quantity !== undefined) {
          const sellUnit = item.selling_unit || item.unit;
          const invUnit = item.inventory_unit;
          const deductionInInvUnit = convertToInventoryUnit(item.quantity, sellUnit, invUnit);
          await supabase
            .from('items')
            .update({ stock_quantity: Math.max(0, (currentItem.stock_quantity || 0) - deductionInInvUnit) })
            .eq('id', item.id);
        }
      }
    } catch (stockErr) {
      console.error(`Stock update failed for item ${item.name} (${item.id}):`, stockErr);
    }
  });

  // Execute all stock updates in parallel (non-blocking for bill creation)
  await Promise.allSettled(stockUpdatePromises);
};
