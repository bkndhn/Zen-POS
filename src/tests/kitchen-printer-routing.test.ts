import { describe, expect, it } from 'vitest';
import { isKitchenUsbDevice, routeKitchenTickets, type KitchenPrinterConfig } from '@/utils/kitchenPrinterConfig';

const cfg = (over: Partial<KitchenPrinterConfig> = {}): KitchenPrinterConfig => ({
  enabled: true, vendorId: 0x0416, productId: 0x5011, serialNumber: 'K1', name: 'Kitchen', width: '58mm', ...over,
});

describe('kitchen printer routing', () => {
  it('kitchen printer off keeps the old rule: no station tickets without a station map', () => {
    expect(routeKitchenTickets(['kitchen', 'bar'], {}, false)).toEqual({ kitchenStations: [], splitStations: [] });
  });

  it('kitchen printer on sends unmapped stations to the kitchen printer', () => {
    expect(routeKitchenTickets(['kitchen', 'bar'], {}, true)).toEqual({ kitchenStations: ['kitchen', 'bar'], splitStations: [] });
  });

  it('a bar with its own Bluetooth printer keeps it; kitchen goes to USB even if mapped', () => {
    const map = { kitchen: 'BT-K', bar: 'BT-Bar' };
    expect(routeKitchenTickets(['kitchen', 'bar', 'dessert'], map, true)).toEqual({ kitchenStations: ['kitchen', 'dessert'], splitStations: ['bar'] });
  });

  it('counter printer never matches the saved kitchen printer when serials differ', () => {
    expect(isKitchenUsbDevice({ vendorId: 0x0416, productId: 0x5011, serialNumber: 'C9' }, cfg())).toBe(false);
    expect(isKitchenUsbDevice({ vendorId: 0x0416, productId: 0x5011, serialNumber: 'K1' }, cfg())).toBe(true);
  });
});

import { getKitchenPrinterConfig as _get, isValidPrinterHost } from '@/utils/kitchenPrinterConfig';
describe('LAN kitchen printer', () => {
  it('accepts 192.168.1.50 and rejects URLs', () => {
    expect(isValidPrinterHost('192.168.1.50')).toBe(true);
    expect(isValidPrinterHost('http://x')).toBe(false);
    expect(isValidPrinterHost('300.1.1.1')).toBe(false);
  });
  it('defaults LAN port to 9100 and never matches a USB device', () => {
    const m = new Map<string,string>(); (globalThis as any).localStorage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => m.set(k, v), removeItem: (k: string) => m.delete(k) };
    localStorage.setItem('zenpos_kitchen_printer', JSON.stringify({ connection: 'lan', host: '10.0.0.9' }));
    const c = _get();
    expect(c?.port).toBe(9100);
    expect(c?.connection).toBe('lan');
    localStorage.removeItem('zenpos_kitchen_printer');
  });
});
