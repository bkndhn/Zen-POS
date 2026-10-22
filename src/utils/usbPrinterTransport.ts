/**
 * USB Printer Transport — WebUSB-based thermal printer support
 * 
 * Key Features:
 * - Pairs USB thermal printer via browser's WebUSB API
 * - Persistent: browser remembers the device across sessions
 * - Sends raw ESC/POS bytes to the printer's bulk OUT endpoint
 * - Auto-reconnect support
 */

// USB Vendor/Product IDs for common thermal printers (expand as needed)
import { isKitchenUsbDevice } from './kitchenPrinterConfig';

const KNOWN_PRINTER_FILTERS: any[] = [
    { classCode: 7 }, // Printer class
];

export class USBPrinterTransport {
    private device: any = null;
    private interfaceNumber: number = 0;
    private endpointOut: number = 0;

    /** Check if WebUSB API is supported */
    static isSupported(): boolean {
        return 'usb' in navigator;
    }

    /** Get currently paired device name, or empty string */
    getDeviceName(): string {
        return this.device?.productName || this.device?.manufacturerName || '';
    }

    isConnected(): boolean {
        return this.device?.opened === true;
    }

    /** Stable identity of the current device (used to tell two printers apart). */
    getIdentity(): { vendorId: number; productId: number; serialNumber: string; name: string } | null {
        if (!this.device) return null;
        return {
            vendorId: this.device.vendorId,
            productId: this.device.productId,
            serialNumber: this.device.serialNumber || '',
            name: this.getDeviceName() || 'USB printer',
        };
    }

    /**
     * Request a new USB device from user.
     * The browser will remember the pairing — subsequent calls to `reconnect()` 
     * will reuse the same device without prompting.
     */
    async requestDevice(options: { rejectIfInUse?: boolean } = {}): Promise<boolean> {
        if (!USBPrinterTransport.isSupported()) {
            console.error('[USB] WebUSB not supported');
            return false;
        }

        try {
            // Request device — shows the browser picker
            this.device = await (navigator as any).usb.requestDevice({
                filters: KNOWN_PRINTER_FILTERS
            });

            // A printer already opened by this page belongs to another role (counter vs kitchen).
            if (options.rejectIfInUse && this.device?.opened) {
                this.device = null;
                return false;
            }

            return await this.open();
        } catch (error: any) {
            if (error.name === 'NotFoundError') {
                // User cancelled device picker
                console.log('[USB] User cancelled device selection');
            } else {
                console.error('[USB] requestDevice error:', error);
            }
            return false;
        }
    }

    /**
     * Try to reconnect to a previously paired device.
     * No user gesture/dialog required — the browser already has permission.
     */
    async reconnect(match?: (device: any) => boolean): Promise<boolean> {
        if (!USBPrinterTransport.isSupported()) return false;

        try {
            const all = await (navigator as any).usb.getDevices();
            // By default (counter printer) never grab the saved kitchen printer.
            const devices = all.filter(match ?? ((d: any) => !isKitchenUsbDevice(d)));
            if (devices.length === 0) {
                console.log('[USB] No previously paired devices found');
                return false;
            }

            // Use the first known device (most recently paired)
            this.device = devices[0];
            console.log('[USB] Found paired device:', this.device.productName);

            return await this.open();
        } catch (error) {
            console.error('[USB] reconnect error:', error);
            return false;
        }
    }

    /** Open the device, claim interface, find bulk OUT endpoint */
    private async open(): Promise<boolean> {
        if (!this.device) return false;

        try {
            await this.device.open();

            // Select configuration 1 (standard for printers)
            if (this.device.configuration === null) {
                await this.device.selectConfiguration(1);
            }

            // Find the printer interface and bulk OUT endpoint
            const config = this.device.configuration;
            if (!config) {
                throw new Error('No USB configuration available');
            }

            let foundInterface = false;

            for (const iface of config.interfaces) {
                for (const alt of iface.alternates) {
                    // Look for Printer class (7) or Vendor-specific with bulk OUT
                    const hasBulkOut = alt.endpoints.some(ep => ep.direction === 'out' && ep.type === 'bulk');

                    if (hasBulkOut && (alt.interfaceClass === 7 || alt.interfaceClass === 255)) {
                        this.interfaceNumber = iface.interfaceNumber;
                        const outEp = alt.endpoints.find(ep => ep.direction === 'out' && ep.type === 'bulk');
                        if (outEp) {
                            this.endpointOut = outEp.endpointNumber;
                            foundInterface = true;
                            break;
                        }
                    }
                }
                if (foundInterface) break;
            }

            // Fallback: try any interface with bulk OUT
            if (!foundInterface) {
                for (const iface of config.interfaces) {
                    for (const alt of iface.alternates) {
                        const outEp = alt.endpoints.find(ep => ep.direction === 'out' && ep.type === 'bulk');
                        if (outEp) {
                            this.interfaceNumber = iface.interfaceNumber;
                            this.endpointOut = outEp.endpointNumber;
                            foundInterface = true;
                            break;
                        }
                    }
                    if (foundInterface) break;
                }
            }

            if (!foundInterface) {
                throw new Error('No suitable bulk OUT endpoint found');
            }

            await this.device.claimInterface(this.interfaceNumber);
            console.log(`[USB] Connected to ${this.getDeviceName()}, interface ${this.interfaceNumber}, endpoint ${this.endpointOut}`);
            return true;

        } catch (error) {
            console.error('[USB] open error:', error);
            await this.close();
            return false;
        }
    }

    /** Send raw bytes to the printer */
    async write(data: Uint8Array): Promise<boolean> {
        if (!this.device || !this.device.opened) {
            console.error('[USB] Device not open');
            return false;
        }

        try {
            // Send in chunks for stability (max 16KB per transfer)
            const chunkSize = 16384;
            for (let i = 0; i < data.length; i += chunkSize) {
                const chunk = data.slice(i, Math.min(i + chunkSize, data.length));
                await this.device.transferOut(this.endpointOut, chunk);
                // Small delay between chunks
                if (i + chunkSize < data.length) {
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
            }
            return true;
        } catch (error) {
            console.error('[USB] write error:', error);
            return false;
        }
    }

    /** Close the device connection */
    async close(): Promise<void> {
        if (this.device && this.device.opened) {
            try {
                await this.device.releaseInterface(this.interfaceNumber);
                await this.device.close();
            } catch (error) {
                console.warn('[USB] close error:', error);
            }
        }
        this.device = null;
    }

    /** Forget the device — removes browser pairing */
    async forget(): Promise<void> {
        if (this.device) {
            const device = this.device;
            try {
                await this.close();
                await device.forget?.();
            } catch (error) {
                console.warn('[USB] forget error:', error);
            }
            this.device = null;
        }
    }
}
