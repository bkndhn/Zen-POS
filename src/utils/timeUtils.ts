/**
 * Time Utilities - AM/PM Formatting
 * Consistent time formatting across the ZenPOS system
 */

/**
 * Format time in 12-hour AM/PM format
 * @param date - Date object or ISO string
 * @returns Formatted time string like "02:35 PM"
 */
export const formatTimeAMPM = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(d.getTime())) {
    return '--:-- --';
  }

  let hours = d.getHours();
  const minutes = d.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';

  hours = hours % 12;
  hours = hours ? hours : 12; // 0 should be 12

  const hoursStr = hours.toString().padStart(2, '0');
  const minutesStr = minutes.toString().padStart(2, '0');

  return `${hoursStr}:${minutesStr} ${ampm}`;
};

/**
 * Format date and time in display format with AM/PM
 * @param date - Date object or ISO string
 * @returns Formatted string like "12 Jan | 02:35 PM"
 */
export const formatDateTimeAMPM = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(d.getTime())) {
    return '-- --- | --:-- --';
  }

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const day = d.getDate().toString().padStart(2, '0');
  const month = months[d.getMonth()];
  const time = formatTimeAMPM(d);

  return `${day} ${month} | ${time}`;
};

/**
 * Get time elapsed since a given date
 * @param date - Date object or ISO string
 * @returns Human readable elapsed time like "5 min" or "1 hr 30 min"
 */
export const getTimeElapsed = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(d.getTime())) {
    return '--';
  }

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));

  if (diffMins < 1) {
    return 'Just now';
  } else if (diffMins < 60) {
    return `${diffMins} min`;
  } else {
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return mins > 0 ? `${hours} hr ${mins} min` : `${hours} hr`;
  }
};

/**
 * Check if a timestamp is within undo window (default 5 minutes)
 * @param date - Date object or ISO string
 * @param windowMinutes - Undo window in minutes (default 5)
 * @returns Boolean indicating if undo is still possible
 */
export const isWithinUndoWindow = (date: Date | string, windowMinutes: number = 5): boolean => {
  const d = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(d.getTime())) {
    return false;
  }

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = diffMs / (1000 * 60);

  return diffMins <= windowMinutes;
};

/**
 * Get simplified short unit from full unit string
 * @param unit - Full unit string like "Gram (g)" or "Piece (pc)"
 * @returns Short unit like "g" or "pc"
 */
export const getShortUnit = (unit?: string): string => {
  if (!unit) return 'pc';

  const unitLower = unit.toLowerCase().trim();

  // Check for common unit patterns and return short form
  // IMPORTANT: Check more specific units first (kilogram before gram, milliliter before liter)
  // because "milliliter" contains "liter" and "kilogram" contains "gram"
  if (unitLower.includes('kilogram') || unitLower === 'kg' || unitLower.includes('(kg)')) return 'kg';
  if (unitLower.includes('milliliter') || unitLower === 'ml' || unitLower.includes('(ml)')) return 'ml';
  if (unitLower.includes('gram') || unitLower === 'g' || unitLower.includes('(g)')) return 'g';
  if (unitLower.includes('liter') || unitLower === 'l' || unitLower.includes('(l)')) return 'L';
  if (unitLower.includes('piece') || unitLower === 'pc' || unitLower.includes('(pc)')) return 'pc';


  // If unit contains parentheses with short form, extract it
  const match = unit.match(/\(([^)]+)\)/);
  if (match) return match[1];

  // Default: return first 2-3 characters as short form
  return unit.substring(0, 3).toLowerCase();
};

/**
 * Format quantity with smart unit conversion
 * Converts 1000g+ to kg, 1000ml+ to L
 * @param quantity - The quantity value
 * @param unit - The unit string (short form like "g", "ml", "pc")
 * @returns Formatted string like "1.2kg" or "5pc"
 */
export const formatQuantityWithUnit = (quantity: number, unit?: string): string => {
  const shortUnit = getShortUnit(unit);

  // Convert grams to kg if >= 1000
  if (shortUnit === 'g' && quantity >= 1000) {
    return `${(quantity / 1000).toFixed(1)} kg`;
  }

  // Convert ml to L if >= 1000
  if (shortUnit === 'ml' && quantity >= 1000) {
    return `${(quantity / 1000).toFixed(1)} L`;
  }

  // For whole numbers, don't show decimal
  if (Number.isInteger(quantity)) {
    return `${quantity} ${shortUnit}`;
  }

  return `${quantity.toFixed(1)} ${shortUnit}`;
};

/**
 * Checks if a unit represents a weight or volume measurement.
 */
export const isWeightOrVolumeUnit = (unit?: string): boolean => {
  const shortUnit = getShortUnit(unit);
  return ['kg', 'g', 'L', 'ml'].includes(shortUnit);
};

/**
 * Calculates a "Smart Qty Count" based on the logic:
 * - Weight/Volume items (kg, g, L, ml) count as 1
 * - Piece items (pc) count as their actual quantity
 */
export const calculateSmartQtyCount = (items: { quantity: number; unit?: string }[]): number => {
  if (!items || items.length === 0) return 0;

  return items.reduce((acc, item) => {
    // Ensure quantity is a number
    const qty = typeof item.quantity === 'string' ? parseFloat(item.quantity) : item.quantity;
    if (isNaN(qty)) return acc;

    if (isWeightOrVolumeUnit(item.unit)) {
      return acc + 1;
    }
    return acc + qty;
  }, 0);
};

/**
 * Parse a quick chip text (e.g., "500 ml", "1 KG", "6 PC") and calculate the
 * correct quantity to add to the cart based on the item's database unit.
 *
 * Conversion rules:
 * - chip "ml" → item unit "L": divide by 1000
 * - chip "L"  → item unit "ml": multiply by 1000
 * - chip "g"  → item unit "kg": divide by 1000
 * - chip "kg" → item unit "g": multiply by 1000
 * - Same unit or piece-based: use numeric value directly
 *
 * @param chipText - The chip label, e.g. "500 ml", "1.5 KG", "6 PC"
 * @param itemUnit - The item's database unit string, e.g. "Liter (l)", "Gram (g)"
 * @returns The quantity number to add to the cart, or null if parsing fails
 */
export const parseQuickChipQuantity = (chipText: string, itemUnit?: string): number | null => {
  if (!chipText) return null;

  // Extract numeric value and unit from chip text (e.g., "500 ml" → 500, "ml")
  const match = chipText.trim().match(/^([\d.]+)\s*(.+)$/);
  if (!match) return null;

  const chipValue = parseFloat(match[1]);
  if (isNaN(chipValue)) return null;

  const chipUnitRaw = match[2].trim().toLowerCase();
  const itemShortUnit = getShortUnit(itemUnit).toLowerCase();

  // Normalize chip unit to short form
  let chipShortUnit = chipUnitRaw;
  if (chipUnitRaw === 'ml' || chipUnitRaw === 'milliliter') chipShortUnit = 'ml';
  else if (chipUnitRaw === 'l' || chipUnitRaw === 'ltr' || chipUnitRaw === 'liter' || chipUnitRaw === 'litre') chipShortUnit = 'l';
  else if (chipUnitRaw === 'g' || chipUnitRaw === 'gram' || chipUnitRaw === 'gm') chipShortUnit = 'g';
  else if (chipUnitRaw === 'kg' || chipUnitRaw === 'kilogram') chipShortUnit = 'kg';
  else if (chipUnitRaw === 'pc' || chipUnitRaw === 'pcs' || chipUnitRaw === 'piece' || chipUnitRaw === 'pieces') chipShortUnit = 'pc';
  else if (chipUnitRaw === 'box' || chipUnitRaw === 'pack' || chipUnitRaw === 'bottle') chipShortUnit = chipUnitRaw;

  // If units match exactly, return value as-is
  if (chipShortUnit === itemShortUnit) return chipValue;

  // Cross-unit conversions
  // ml → L (divide by 1000)
  if (chipShortUnit === 'ml' && itemShortUnit === 'l') return chipValue / 1000;
  // L → ml (multiply by 1000)
  if (chipShortUnit === 'l' && itemShortUnit === 'ml') return chipValue * 1000;
  // g → kg (divide by 1000)
  if (chipShortUnit === 'g' && itemShortUnit === 'kg') return chipValue / 1000;
  // kg → g (multiply by 1000)
  if (chipShortUnit === 'kg' && itemShortUnit === 'g') return chipValue * 1000;

  // No conversion needed or unknown — use raw value
  return chipValue;
};
