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
    return mins > 0 ? `${hours}hr ${mins} min` : `${hours}hr`;
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

/** Keep max 2 decimals for quantities, trim trailing zeros (40.199999 -> "40.19"). */
export const trim2 = (n: number): string => {
  if (!Number.isFinite(n)) return '0';
  const sign = n < 0 ? -1 : 1;
  const r = sign * (Math.trunc(Math.abs(n) * 100) / 100);
  if (Number.isInteger(r)) return String(r);
  return r.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
};

/**
 * Format quantity with smart unit conversion (max 2 decimals).
 * - g >= 1000  → kg
 * - ml >= 1000 → L
 * - kg < 1     → g  (whole number)
 * - L  < 1     → ml (whole number)
 */
export const formatQuantityWithUnit = (quantity: number, unit?: string): string => {
  const shortUnit = getShortUnit(unit);
  const q = Number(quantity);
  if (!Number.isFinite(q)) return `0 ${shortUnit}`;

  if (shortUnit === 'g' && q >= 1000) return `${trim2(q / 1000)} kg`;
  if (shortUnit === 'kg' && q > 0 && q < 1) return `${Math.round(q * 1000)} g`;
  if (shortUnit === 'ml' && q >= 1000) return `${trim2(q / 1000)} L`;
  if (shortUnit === 'L' && q > 0 && q < 1) return `${Math.round(q * 1000)} ml`;

  return `${trim2(q)} ${shortUnit}`;
};

/** Format stored inventory exactly in its stored unit; no kg↔g or L↔ml auto-switch. */
export const formatStoredQuantity = (quantity: number | string | null | undefined, unit?: string | null): string => {
  const q = Number(quantity);
  return `${trim2(Number.isFinite(q) ? q : 0)} ${getShortUnit(unit || '')}`;
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
export const calculateSmartQtyCount = (items: { quantity: number; unit?: string; selling_unit?: string }[]): number => {
  if (!items || items.length === 0) return 0;

  return items.reduce((acc, item) => {
    // Ensure quantity is a number
    const qty = typeof item.quantity === 'string' ? parseFloat(item.quantity) : item.quantity;
    if (isNaN(qty)) return acc;

    if (isWeightOrVolumeUnit(item.selling_unit || item.unit)) {
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
  if (!match) {
    // If it's a plain number (e.g. "500"), parse it directly
    const plainMatch = chipText.trim().match(/^([\d.]+)$/);
    if (plainMatch) {
      const val = parseFloat(plainMatch[1]);
      return isNaN(val) ? null : val;
    }
    return null;
  }

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

/**
 * Validates and normalizes quick chip inputs based on the item's selling unit.
 *
 * If a chip is a plain number, the item's selling unit is automatically appended.
 * Enforces that chip units belong to the same family as the item's selling unit:
 *   - Weight family (g, kg)
 *   - Volume family (ml, L)
 *   - Piece family (pc) or other matching units
 *
 * @param quickChipsStr - Comma-separated quick chips string
 * @param sellingUnit - The item's selling unit string
 * @returns An object containing either the normalized array of chips or an error message
 */
export const validateAndNormalizeQuickChips = (
  quickChipsStr: string,
  sellingUnit?: string
): { error?: string; normalized?: string[] } => {
  if (!quickChipsStr || !quickChipsStr.trim()) return { normalized: [] };

  const chips = quickChipsStr
    .split(',')
    .map(c => c.trim())
    .filter(c => c.length > 0);

  const shortUnit = getShortUnit(sellingUnit);

  // Helper to determine unit family
  const getUnitFamily = (unitStr: string): 'weight' | 'volume' | 'piece' => {
    const u = unitStr.toLowerCase().trim();
    if (u === 'g' || u === 'kg' || u === 'gram' || u === 'kilogram' || u === 'gm') return 'weight';
    if (u === 'ml' || u === 'l' || u === 'milliliter' || u === 'liter' || u === 'litre' || u === 'ltr') return 'volume';
    return 'piece';
  };

  const itemFamily = getUnitFamily(sellingUnit || '');
  const normalizedChips: string[] = [];

  for (const chip of chips) {
    // 0. Check if it's an amount chip (starts with ₹ or Rs.)
    if (chip.startsWith('₹') || chip.startsWith('Rs') || chip.startsWith('Rs.')) {
      const amtStr = chip.replace(/^(₹|Rs\.?)/, '').trim();
      const val = parseFloat(amtStr);
      if (isNaN(val) || val <= 0) {
        return { error: `Invalid amount in quick chip: "${chip}"` };
      }
      normalizedChips.push(`₹${val}`);
      continue;
    }

    // 1. Check if it's a plain number (e.g., "500", "1.5")
    const plainMatch = chip.match(/^([\d.]+)$/);
    if (plainMatch) {
      const val = parseFloat(plainMatch[1]);
      if (isNaN(val) || val <= 0) {
        return { error: `Invalid number in quick chip: "${chip}"` };
      }
      // Normalize by appending the item's short unit
      normalizedChips.push(`${val} ${shortUnit}`);
      continue;
    }

    // 2. Check if it has a value and a unit (e.g., "250 ml")
    const match = chip.match(/^([\d.]+)\s*(.+)$/);
    if (!match) {
      return { error: `Invalid format for quick chip: "${chip}". Must be a number optionally followed by a unit.` };
    }

    const val = parseFloat(match[1]);
    const unitRaw = match[2].trim().toLowerCase();
    if (isNaN(val) || val <= 0) {
      return { error: `Invalid number in quick chip: "${chip}"` };
    }

    const chipFamily = getUnitFamily(unitRaw);
    if (chipFamily !== itemFamily) {
      const allowedUnits =
        itemFamily === 'weight'
          ? 'weight units (g, kg)'
          : itemFamily === 'volume'
          ? 'volume units (ml, L)'
          : 'piece units (pc)';
      return {
        error: `Quick chip "${chip}" is invalid. Since the item unit is "${sellingUnit || 'Piece (pc)'}", quick chips can only use ${allowedUnits}.`
      };
    }

    // Normalize unit string
    let normalizedUnit = match[2].trim();
    if (unitRaw === 'ml' || unitRaw === 'milliliter') normalizedUnit = 'ml';
    else if (unitRaw === 'l' || unitRaw === 'ltr' || unitRaw === 'liter' || unitRaw === 'litre') normalizedUnit = 'L';
    else if (unitRaw === 'g' || unitRaw === 'gram' || unitRaw === 'gm') normalizedUnit = 'g';
    else if (unitRaw === 'kg' || unitRaw === 'kilogram') normalizedUnit = 'kg';
    else if (unitRaw === 'pc' || unitRaw === 'pcs' || unitRaw === 'piece' || unitRaw === 'pieces') normalizedUnit = 'pc';

    normalizedChips.push(`${val} ${normalizedUnit}`);
  }

  return { normalized: normalizedChips };
};

/**
 * Converts a quantity from the selling unit to the inventory unit.
 * This is essential for stock comparisons because stock_quantity is stored
 * in the inventory unit (e.g., Liters) but the cart tracks quantities in
 * the selling unit (e.g., Milliliters).
 *
 * Example: item sold in 200ml portions, stock tracked in Liters
 *   convertToInventoryUnit(200, 'Milliliter (ml)', 'Liter (l)') => 0.2
 *
 * If both units are the same or no inventory_unit is set, returns the original quantity.
 */
export const convertToInventoryUnit = (
  quantity: number,
  sellingUnit?: string,
  inventoryUnit?: string
): number => {
  if (!sellingUnit || !inventoryUnit) return quantity;

  const sellShort = getShortUnit(sellingUnit).toLowerCase();
  const invShort = getShortUnit(inventoryUnit).toLowerCase();

  // Same unit — no conversion needed
  if (sellShort === invShort) return quantity;

  // ml → L (divide by 1000)
  if (sellShort === 'ml' && invShort === 'l') return quantity / 1000;
  // L → ml (multiply by 1000)
  if (sellShort === 'l' && invShort === 'ml') return quantity * 1000;
  // g → kg (divide by 1000)
  if (sellShort === 'g' && invShort === 'kg') return quantity / 1000;
  // kg → g (multiply by 1000)
  if (sellShort === 'kg' && invShort === 'g') return quantity * 1000;

  // No known conversion — return as-is
  return quantity;
};
