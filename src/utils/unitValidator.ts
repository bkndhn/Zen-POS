/**
 * Runtime unit-consistency validator.
 * Ensures selling_unit and inventory_unit belong to the same family
 * (weight g↔kg, volume ml↔L, or piece), so 1000× conversions stay valid.
 *
 * Usage:
 *   const issues = validateItemUnits(items);
 *   if (issues.length) console.warn(issues);
 */

import { getShortUnit } from './timeUtils';

export type UnitFamily = 'weight' | 'volume' | 'piece' | 'unknown';

export const familyOf = (unit?: string): UnitFamily => {
  const s = getShortUnit(unit).toLowerCase();
  if (s === 'g' || s === 'kg') return 'weight';
  if (s === 'ml' || s === 'l') return 'volume';
  if (s === 'pc') return 'piece';
  return 'unknown';
};

export interface UnitIssue {
  itemId?: string;
  itemName?: string;
  sellingUnit?: string;
  inventoryUnit?: string;
  message: string;
}

export interface ValidatableItem {
  id?: string;
  name?: string;
  unit?: string;
  selling_unit?: string;
  inventory_unit?: string;
}

/** Validate a single item; returns list of issues (empty if ok). */
export const validateItemUnit = (it: ValidatableItem): UnitIssue[] => {
  const issues: UnitIssue[] = [];
  const sell = it.selling_unit || it.unit;
  const inv = it.inventory_unit || it.unit;
  if (!sell && !inv) return issues;
  const fSell = familyOf(sell);
  const fInv = familyOf(inv);
  if (fSell === 'unknown' || fInv === 'unknown') {
    issues.push({
      itemId: it.id, itemName: it.name, sellingUnit: sell, inventoryUnit: inv,
      message: `Unknown unit family for "${it.name || 'item'}" (sell=${sell || '-'}, inv=${inv || '-'}). Use g/kg/ml/L/pc.`,
    });
    return issues;
  }
  if (fSell !== fInv) {
    issues.push({
      itemId: it.id, itemName: it.name, sellingUnit: sell, inventoryUnit: inv,
      message: `Unit family mismatch for "${it.name || 'item'}": selling=${sell} (${fSell}) vs inventory=${inv} (${fInv}). Conversion cannot be trusted.`,
    });
  }
  return issues;
};

/** Validate a batch of items. */
export const validateItemUnits = (items: ValidatableItem[]): UnitIssue[] => {
  const all: UnitIssue[] = [];
  for (const it of items) all.push(...validateItemUnit(it));
  return all;
};

/**
 * Ensures the conversion factor between selling and inventory units is
 * one of the supported 1000× pairs, or 1 (same-family same-unit).
 */
export const isConversionSupported = (sellingUnit?: string, inventoryUnit?: string): boolean => {
  const s = getShortUnit(sellingUnit).toLowerCase();
  const i = getShortUnit(inventoryUnit).toLowerCase();
  if (s === i) return true;
  const pairs = new Set(['g-kg', 'kg-g', 'ml-l', 'l-ml']);
  return pairs.has(`${s}-${i}`);
};
