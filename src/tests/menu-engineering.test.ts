import { describe, it, expect } from 'vitest';
import { buildMenuMatrix } from '@/utils/menuEngineering';

describe('menu engineering matrix', () => {
  const lines = [
    { name: 'Biryani', quantity: 50, total: 10000, unitCost: 80 }, // margin 120/unit, popular
    { name: 'Tea', quantity: 100, total: 1500, unitCost: 5 }, // 10/unit, popular
    { name: 'Lobster', quantity: 2, total: 2000, unitCost: 300 }, // 700/unit, slow
    { name: 'Soup', quantity: 3, total: 150, unitCost: 40 }, // 10/unit, slow
  ];
  const byName = Object.fromEntries(buildMenuMatrix(lines).map((i) => [i.name, i]));

  it('classifies the four quadrants', () => {
    expect(byName.Biryani.quadrant).toBe('Star');
    expect(byName.Tea.quadrant).toBe('Plowhorse');
    expect(byName.Lobster.quadrant).toBe('Puzzle');
    expect(byName.Soup.quadrant).toBe('Dog');
  });

  it('computes margin from purchase cost', () => {
    expect(byName.Biryani.margin).toBe(6000);
    expect(byName.Biryani.unitMargin).toBe(120);
  });

  it('merges repeated item lines and flags unknown cost', () => {
    const r = buildMenuMatrix([
      { name: 'Dosa', quantity: 2, total: 100 },
      { name: 'Dosa', quantity: 3, total: 150 },
    ]);
    expect(r[0].qty).toBe(5);
    expect(r[0].costKnown).toBe(false);
  });
});
