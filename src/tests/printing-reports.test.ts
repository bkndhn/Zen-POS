import { beforeAll, describe, expect, it } from 'vitest';

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

beforeAll(() => {
  if (typeof globalThis.localStorage === 'undefined') {
    const store = new Map<string, string>();
    (globalThis as any).localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() { return store.size; },
    };
  }
});

describe('kitchen ticket routing and layout', () => {
  it('routes each item to its station and defaults unknown categories to the kitchen', async () => {
    const { groupItemsByStation } = await import('@/utils/kotGenerator');
    const groups = groupItemsByStation(
      [
        { name: 'Tea', quantity: 2, category: 'Beverages' } as any,
        { name: 'Naan', quantity: 3, category: 'Breads' } as any,
        { name: 'Mystery', quantity: 1, category: 'Unmapped' } as any,
      ],
      { beverages: 'bar', breads: 'tandoor' },
    );

    expect(Object.keys(groups).sort()).toEqual(['bar', 'kitchen', 'tandoor']);
    expect(groups['bar'][0].name).toBe('Tea');
    expect(groups['kitchen'][0].name).toBe('Mystery');
  });

  it('builds a readable ticket with the station name and every item', async () => {
    const { buildKOTBytes } = await import('@/utils/kotGenerator');
    const text = decode(
      buildKOTBytes(
        'kitchen' as any,
        [
          { name: 'Paneer Tikka', quantity: 2 } as any,
          { name: 'Dal Fry', quantity: 1 } as any,
        ],
        { billNo: 'A-12', printerWidth: '58mm', shopName: 'Zen Cafe' } as any,
      ),
    );

    expect(text).toContain('KITCHEN');
    expect(text).toContain('Paneer Tikka');
    expect(text).toContain('Dal Fry');
    expect(text).toContain('A-12');
  });

  it('keeps 80mm lines wider than 58mm lines', async () => {
    const { buildKOTBytes } = await import('@/utils/kotGenerator');
    const meta = { orderNumber: 'A-1', shopName: 'Zen Cafe' };
    const narrow = decode(buildKOTBytes('kitchen' as any, [{ name: 'Tea', quantity: 1 } as any], { ...meta, printerWidth: '58mm' } as any));
    const wide = decode(buildKOTBytes('kitchen' as any, [{ name: 'Tea', quantity: 1 } as any], { ...meta, printerWidth: '80mm' } as any));

    const longestLine = (s: string) => Math.max(...s.split('\n').map((l) => l.length));
    expect(longestLine(wide)).toBeGreaterThan(longestLine(narrow));
  });
});

describe('day-end report printing', () => {
  const data = {
    branchName: 'Main Branch',
    date: '2026-09-16',
    totalBills: 42,
    totalAmount: 18650.5,
    openingCash: 2000,
    expectedCash: 12000,
    actualCash: 11900,
    variance: -100,
    paymentTotals: { cash: 9900, upi: 8750.5 },
  };

  it('includes the totals, payment split and cash variance', async () => {
    const { buildZReportBytes } = await import('@/utils/zReportPrinter');
    const text = decode(buildZReportBytes(data as any, '80mm'));

    expect(text).toContain('Main Branch');
    expect(text).toContain('42');
    expect(text).toContain('18650.50');
    expect(text.toLowerCase()).toContain('cash');
    expect(text.toLowerCase()).toContain('upi');
    expect(text).toContain('100.00');
  });

  it('ends with a cut command so the paper tears cleanly', async () => {
    const { buildZReportBytes } = await import('@/utils/zReportPrinter');
    const bytes = buildZReportBytes(data as any, '58mm');
    const tail = Array.from(bytes.slice(-4));
    expect(tail).toContain(0x1d);
    expect(bytes.length).toBeGreaterThan(50);
  });

  it('prints a report with no sales without crashing', async () => {
    const { buildZReportBytes } = await import('@/utils/zReportPrinter');
    const text = decode(
      buildZReportBytes(
        { branchName: 'Main', date: '2026-09-16', totalBills: 0, totalAmount: 0, paymentTotals: {} } as any,
        '58mm',
      ),
    );
    expect(text).toContain('0.00');
  });
});
