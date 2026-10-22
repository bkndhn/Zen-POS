/**
 * Dedicated USB kitchen printer. Runs on its own USB connection so the kitchen
 * ticket prints at the same time as the counter receipt instead of after it.
 */
import { USBPrinterTransport } from './usbPrinterTransport';
import {
  clearKitchenPrinterConfig,
  getKitchenPrinterConfig,
  isKitchenUsbDevice,
  saveKitchenPrinterConfig,
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

const writeOnce = async (bytes: Uint8Array): Promise<boolean> => {
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
  isConnected: () => transport.isConnected(),

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
