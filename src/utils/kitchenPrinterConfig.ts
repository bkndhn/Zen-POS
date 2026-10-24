/**
 * Kitchen printer settings (device-local) and routing rules.
 * Pure module: no printer or browser-API imports so it is safe to test and
 * safe to import from the USB transport without circular dependencies.
 */

export const KITCHEN_PRINTER_KEY = 'zenpos_kitchen_printer';

export interface KitchenPrinterConfig {
  enabled: boolean;
  vendorId: number;
  productId: number;
  serialNumber: string;
  name: string;
  width: '58mm' | '80mm';
  /** 'usb' (browser USB), 'lan' (network printer), or 'bluetooth' (Android app). */
  connection?: 'usb' | 'lan' | 'bluetooth';
  host?: string;
  port?: number;
  bluetoothAddress?: string;
  bluetoothName?: string;
  /** Fallback Bluetooth address when LAN drops (Wi-Fi failover). */
  fallbackBluetoothAddress?: string;
  fallbackBluetoothName?: string;
}

/** Accepts a plain IPv4 address or hostname; rejects anything with a scheme or path. */
export const isValidPrinterHost = (host: string): boolean =>
  /^(\d{1,3}\.){3}\d{1,3}$/.test(host.trim()) && host.trim().split('.').every(n => Number(n) <= 255);

export interface UsbIdentity {
  vendorId?: number;
  productId?: number;
  serialNumber?: string | null;
}

export const getKitchenPrinterConfig = (): KitchenPrinterConfig | null => {
  try {
    const raw = localStorage.getItem(KITCHEN_PRINTER_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);

    if (p?.connection === 'bluetooth') {
      if (!p.bluetoothAddress) return null;
      return {
        enabled: p.enabled !== false, vendorId: 0, productId: 0, serialNumber: '',
        name: typeof p.name === 'string' && p.name ? p.name : `Kitchen BT ${p.bluetoothName || p.bluetoothAddress}`,
        width: p.width === '80mm' ? '80mm' : '58mm',
        connection: 'bluetooth',
        bluetoothAddress: p.bluetoothAddress,
        bluetoothName: typeof p.bluetoothName === 'string' ? p.bluetoothName : '',
        fallbackBluetoothAddress: p.fallbackBluetoothAddress,
        fallbackBluetoothName: p.fallbackBluetoothName,
      };
    }

    if (p?.connection === 'lan') {
      if (typeof p.host !== 'string' || !isValidPrinterHost(p.host)) return null;
      return {
        enabled: p.enabled !== false, vendorId: 0, productId: 0, serialNumber: '',
        name: typeof p.name === 'string' && p.name ? p.name : `Kitchen ${p.host}`,
        width: p.width === '80mm' ? '80mm' : '58mm',
        connection: 'lan', host: p.host.trim(),
        port: Number.isInteger(p.port) && p.port > 0 && p.port < 65536 ? p.port : 9100,
        fallbackBluetoothAddress: typeof p.fallbackBluetoothAddress === 'string' ? p.fallbackBluetoothAddress : undefined,
        fallbackBluetoothName: typeof p.fallbackBluetoothName === 'string' ? p.fallbackBluetoothName : undefined,
      };
    }

    if (typeof p?.vendorId !== 'number' || typeof p?.productId !== 'number') return null;
    return {
      enabled: p.enabled !== false,
      vendorId: p.vendorId,
      productId: p.productId,
      serialNumber: typeof p.serialNumber === 'string' ? p.serialNumber : '',
      name: typeof p.name === 'string' && p.name ? p.name : 'Kitchen printer',
      width: p.width === '80mm' ? '80mm' : '58mm',
    };
  } catch {
    return null;
  }
};

export const saveKitchenPrinterConfig = (config: KitchenPrinterConfig): void => {
  localStorage.setItem(KITCHEN_PRINTER_KEY, JSON.stringify(config));
};

export const clearKitchenPrinterConfig = (): void => {
  localStorage.removeItem(KITCHEN_PRINTER_KEY);
};

/** True when the USB device is the saved kitchen printer. */
export const isKitchenUsbDevice = (device: UsbIdentity, config = getKitchenPrinterConfig()): boolean => {
  if (!config || config.connection === 'lan' || config.connection === 'bluetooth') return false;
  if (device.vendorId !== config.vendorId || device.productId !== config.productId) return false;
  if (config.serialNumber) return (device.serialNumber || '') === config.serialNumber;
  return true;
};

/**
 * Decide which station tickets go to the kitchen printer and which keep using
 * their own mapped Bluetooth printers.
 */
export const routeKitchenTickets = (
  stations: string[],
  stationMap: Record<string, string>,
  kitchenPrinterOn: boolean,
): { kitchenStations: string[]; splitStations: string[] } => {
  const unique = Array.from(new Set(stations.map(s => s.toLowerCase())));
  if (!kitchenPrinterOn) {
    return { kitchenStations: [], splitStations: Object.keys(stationMap).length > 0 ? unique : [] };
  }
  const kitchenStations = unique.filter(s => s === 'kitchen' || !stationMap[s]);
  const splitStations = unique.filter(s => s !== 'kitchen' && !!stationMap[s]);
  return { kitchenStations, splitStations };
};
