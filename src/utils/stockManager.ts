import { supabase } from '@/integrations/supabase/client';
import { convertToInventoryUnit, toStoredQuantity2 } from '@/utils/timeUtils';

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
        .select('ingredient_id, quantity, recipe_unit, ingredient:ingredients(unit, stock_quantity, cost_per_unit)')
        .eq('item_id', item.id);

      if (!recipeErr && recipeParts && recipeParts.length > 0) {
        // Recipe exists: Deduct each ingredient's stock
        for (const part of recipeParts) {
          try {
            const ingData = part.ingredient as any;
            if (ingData) {
              let deduction = Number(part.quantity) * Number(item.quantity);
              // Apply unit conversion if recipe_unit differs from ingredient unit
              const rUnit = (part.recipe_unit || ingData.unit || '').toLowerCase();
              const iUnit = (ingData.unit || '').toLowerCase();
              if (rUnit !== iUnit) {
                if ((rUnit === 'g' && iUnit === 'kg') || (rUnit === 'ml' && iUnit === 'l')) deduction = deduction / 1000;
                else if ((rUnit === 'kg' && iUnit === 'g') || (rUnit === 'l' && iUnit === 'ml')) deduction = deduction * 1000;
              }
              const newStock = toStoredQuantity2(Math.max(0, (Number(ingData.stock_quantity) || 0) - deduction));
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
            .update({ stock_quantity: toStoredQuantity2(Math.max(0, (currentItem.stock_quantity || 0) - deductionInInvUnit)) })
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
