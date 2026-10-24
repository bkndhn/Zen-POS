/**
 * Dedicated USB kitchen printer. Runs on its own USB connection so the kitchen
 * ticket prints at the same time as the counter receipt instead of after it.
 */
import { Capacitor } from '@capacitor/core';
import { BluetoothPrinter } from './printerManager';
import { USBPrinterTransport } from './usbPrinterTransport';
import {
  clearKitchenPrinterConfig,
  getKitchenPrinterConfig,
  isKitchenUsbDevice,
  saveKitchenPrinterConfig,
  isValidPrinterHost,
  type KitchenPrinterConfig,
} from './kitchenPrinterConfig';

const transport = new USBPrinterTransport();
let chain: Promise<unknown> = Promise.resolve();

const ensureConnected = async (): Promise<boolean> => {
  const config = getKitchenPrinterConfig();
  if (!config) return false;
  if (transport.isConnected()) return true;
  return transport.reconnect(d => isKitchenUsbDevice(d, config));
};

const toHex = (b: Uint8Array) => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');

const writeLan = async (bytes: Uint8Array, host: string, port: number): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const r = await BluetoothPrinter.printNetwork({ host, port, hex: toHex(bytes) });
    return !!r?.success;
  } catch {
    return false;
  }
};

const writeOnce = async (bytes: Uint8Array): Promise<boolean> => {
  const cfg = getKitchenPrinterConfig();
  if (cfg?.connection === 'lan' && cfg.host) {
    if (await writeLan(bytes, cfg.host, cfg.port || 9100)) return true;
    return writeLan(bytes, cfg.host, cfg.port || 9100); // one retry for a sleepy printer
  }
  if (!(await ensureConnected())) return false;
  if (await transport.write(bytes)) return true;
  // Cable re-plugged or printer power-cycled: reopen once and retry.
  await transport.close();
  if (!(await ensureConnected())) return false;
  return transport.write(bytes);
};

export const kitchenPrinter = {
  isSupported: () => USBPrinterTransport.isSupported(),
  getConfig: getKitchenPrinterConfig,
  isActive: () => !!getKitchenPrinterConfig()?.enabled,
  isConnected: () => getKitchenPrinterConfig()?.connection === 'lan' || transport.isConnected(),

  async pair(width: KitchenPrinterConfig['width'] = '58mm'): Promise<{ ok: boolean; name?: string; error?: string }> {
    if (!USBPrinterTransport.isSupported()) return { ok: false, error: 'This browser cannot use USB printers.' };
    await transport.close();
    const ok = await transport.requestDevice({ rejectIfInUse: true });
    if (!ok) return { ok: false, error: 'No printer chosen, or it is already used as the counter printer.' };
    const id = transport.getIdentity();
    if (!id) return { ok: false, error: 'Printer could not be read.' };
    if (!id.serialNumber) {
      const all = await (navigator as any).usb.getDevices();
      const twins = all.filter((d: any) => d.vendorId === id.vendorId && d.productId === id.productId);
      if (twins.length > 1) {
        await transport.close();
        return { ok: false, error: 'Counter and kitchen printers are the same model and cannot be told apart over USB. Use Bluetooth for one of them.' };
      }
    }
    saveKitchenPrinterConfig({ enabled: true, ...id, width });
    return { ok: true, name: id.name };
  },

  /** Network (LAN) kitchen printer — works in the Android app only. */
  isLanSupported: () => Capacitor.isNativePlatform(),
  async pairLan(host: string, port = 9100, width: KitchenPrinterConfig['width'] = '58mm'): Promise<{ ok: boolean; error?: string }> {
    if (!isValidPrinterHost(host)) return { ok: false, error: 'Enter the printer IP, like 192.168.1.50.' };
    if (!Capacitor.isNativePlatform()) return { ok: false, error: 'Network printers work in the ZenPOS Android app.' };
    await transport.close().catch(() => undefined);
    saveKitchenPrinterConfig({ enabled: true, vendorId: 0, productId: 0, serialNumber: '', name: `Kitchen ${host}`, width, connection: 'lan', host: host.trim(), port });
    return { ok: true };
  },

  setEnabled(enabled: boolean) {
    const config = getKitchenPrinterConfig();
    if (config) saveKitchenPrinterConfig({ ...config, enabled });
  },

  setWidth(width: KitchenPrinterConfig['width']) {
    const config = getKitchenPrinterConfig();
    if (config) saveKitchenPrinterConfig({ ...config, width });
  },

  async forget() {
    await transport.forget().catch(() => undefined);
    await transport.close().catch(() => undefined);
    clearKitchenPrinterConfig();
  },

  /** Serialised so two quick bills never interleave bytes on the same printer. */
  print(bytes: Uint8Array): Promise<boolean> {
    const job = chain.then(() => writeOnce(bytes)).catch(() => false);
    chain = job;
    return job;
  },
};
