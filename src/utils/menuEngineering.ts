// Menu Engineering (Kasavana & Smith): popularity vs contribution margin.
export type Quadrant = 'Star' | 'Plowhorse' | 'Puzzle' | 'Dog';

export interface MenuSaleLine {
  name: string;
  category?: string;
  quantity: number;
  total: number; // revenue for this line
  unitCost?: number; // purchase rate per unit, 0/undefined = unknown
}

export interface MenuItemStat {
  name: string;
  category: string;
  qty: number;
  revenue: number;
  cost: number;
  margin: number; // total contribution margin
  unitMargin: number; // margin per unit sold
  mixPct: number; // share of total quantity
  costKnown: boolean;
  quadrant: Quadrant;
  action: string;
}

const ACTIONS: Record<Quadrant, string> = {
  Star: 'Keep quality & price. Place at top of menu.',
  Plowhorse: 'Popular but low margin: raise price ₹5–10 or cut portion cost.',
  Puzzle: 'Good margin but slow: promote, rename, add to combos.',
  Dog: 'Low sales & margin: remove or replace.',
};

/**
 * Popularity threshold = 70% of equal share (standard rule).
 * Margin threshold = quantity-weighted average unit margin.
 */
export function buildMenuMatrix(lines: MenuSaleLine[]): MenuItemStat[] {
  const map = new Map<string, Omit<MenuItemStat, 'unitMargin' | 'mixPct' | 'quadrant' | 'action'>>();
  for (const l of lines) {
    const key = l.name.trim();
    if (!key || !(l.quantity > 0)) continue;
    const cur = map.get(key) || { name: key, category: l.category || 'Other', qty: 0, revenue: 0, cost: 0, margin: 0, costKnown: true };
    const cost = (l.unitCost || 0) * l.quantity;
    cur.qty += l.quantity;
    cur.revenue += l.total || 0;
    cur.cost += cost;
    cur.margin = cur.revenue - cur.cost;
    if (!l.unitCost) cur.costKnown = false;
    map.set(key, cur);
  }
  const items = Array.from(map.values());
  if (items.length === 0) return [];
  const totalQty = items.reduce((s, i) => s + i.qty, 0);
  const totalMargin = items.reduce((s, i) => s + i.margin, 0);
  const avgUnitMargin = totalQty > 0 ? totalMargin / totalQty : 0;
  const popThreshold = (1 / items.length) * 0.7;

  return items
    .map((i) => {
      const mixPct = totalQty > 0 ? i.qty / totalQty : 0;
      const unitMargin = i.qty > 0 ? i.margin / i.qty : 0;
      const highPop = mixPct >= popThreshold;
      const highMargin = unitMargin >= avgUnitMargin;
      const quadrant: Quadrant = highPop && highMargin ? 'Star' : highPop ? 'Plowhorse' : highMargin ? 'Puzzle' : 'Dog';
      return { ...i, unitMargin, mixPct, quadrant, action: ACTIONS[quadrant] };
    })
    .sort((a, b) => b.margin - a.margin);
}
