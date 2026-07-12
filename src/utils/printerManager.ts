/**
 * Printer Manager - Singleton for persistent printer connection
 * Supports both Bluetooth and USB (wired) thermal printers.
 * 
 * Key Features:
 * - Caches Bluetooth/USB device and connection
 * - Auto-reconnects on disconnect
 * - Only asks for device once per session (persistent pairing)
 * - Provides connection status observable
 * - Remembers printer type in localStorage
 */

import { generateReceiptBytes, PrintData } from './bluetoothPrinter';
import { USBPrinterTransport } from './usbPrinterTransport';

// Connection states
export type PrinterConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';
export type PrinterType = 'bluetooth' | 'usb' | 'none';

export interface PrintLogEntry {
    ts: number;
    action: 'print' | 'test' | 'self-test' | 'connect' | 'reconnect' | 'disconnect' | 'error';
    status: 'ok' | 'fail' | 'info';
    ms?: number;
    detail?: string;
}

// Event types
type ConnectionListener = (state: PrinterConnectionState, deviceName?: string) => void;
type LogListener = (log: PrintLogEntry[]) => void;

const PRINTER_TYPE_KEY = 'hotel_pos_printer_type';
const BLUETOOTH_OPTIONAL_SERVICES = [
    '000018f0-0000-1000-8000-00805f9b34fb',
    '0000ffe0-0000-1000-8000-00805f9b34fb',
    '0000ffe5-0000-1000-8000-00805f9b34fb',
    '0000ff00-0000-1000-8000-00805f9b34fb',
    '0000ffb0-0000-1000-8000-00805f9b34fb',
    '0000ae30-0000-1000-8000-00805f9b34fb',
    '49535343-fe7d-4ae5-8fa9-9fafd205e455',
    'e7810a71-73ae-499d-8c15-faa9aef0c3f2'
];
const BLUETOOTH_CHUNK_SIZE = 180;
const BLUETOOTH_CHUNK_DELAY_MS = 0;
const QUEUE_INTER_JOB_DELAY_MS = 0;
const MAX_LOG_ENTRIES = 50;

// Printer Manager Singleton
class PrinterManager {
    private static instance: PrinterManager;

    // Bluetooth connection state
    private device: any = null;
    private server: any = null;
    private characteristic: any = null;

    // USB connection state
    private usbTransport: USBPrinterTransport = new USBPrinterTransport();

    // Shared state
    private connectionState: PrinterConnectionState = 'disconnected';
    private deviceName: string = '';
    private _printerType: PrinterType = 'none';

    // Listeners for React components
    private listeners: Set<ConnectionListener> = new Set();

    // Reconnection settings — keep trying so printer stays live across app open/close/route changes
    private reconnectAttempts: number = 0;
    private maxReconnectAttempts: number = 10;
    private reconnectDelay: number = 800;

    // Print queue for offline/disconnected scenarios
    private printQueue: PrintData[] = [];
    private isProcessingQueue: boolean = false;
    private writeChain: Promise<void> = Promise.resolve();

    private constructor() {
        // Restore saved printer type
        const saved = localStorage.getItem(PRINTER_TYPE_KEY);
        if (saved === 'bluetooth' || saved === 'usb') {
            this._printerType = saved;
            // Attempt background reconnection
            setTimeout(() => {
                this.autoReconnect().catch(err => {
                    console.log('Background auto-reconnect failed:', err);
                });
            }, 500);
        }

        // Re-establish printer whenever the tab becomes visible or window regains focus.
        // Keeps the printer "always connected" across app close/reopen, route changes,
        // screen locks, and background/foreground transitions on mobile.
        if (typeof window !== 'undefined') {
            const tryReconnect = () => {
                if (this._printerType !== 'none' && !this.isConnected() && this.connectionState !== 'connecting') {
                    this.autoReconnect().catch(() => undefined);
                }
            };
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') tryReconnect();
            });
            window.addEventListener('focus', tryReconnect);
            window.addEventListener('online', tryReconnect);
        }
    }

    public static getInstance(): PrinterManager {
        if (!PrinterManager.instance) {
            PrinterManager.instance = new PrinterManager();
        }
        return PrinterManager.instance;
    }

    // Subscribe to connection state changes
    public subscribe(listener: ConnectionListener): () => void {
        this.listeners.add(listener);
        // Immediately notify with current state
        listener(this.connectionState, this.deviceName);
        // Return unsubscribe function
        return () => this.listeners.delete(listener);
    }

    private notifyListeners(): void {
        this.listeners.forEach(listener => listener(this.connectionState, this.deviceName));
    }

    private setState(state: PrinterConnectionState): void {
        this.connectionState = state;
        this.notifyListeners();
    }

    public getState(): PrinterConnectionState {
        return this.connectionState;
    }

    public getDeviceName(): string {
        return this.deviceName;
    }

    public get printerType(): PrinterType {
        return this._printerType;
    }

    public isConnected(): boolean {
        if (this._printerType === 'usb') {
            return this.connectionState === 'connected' && this.usbTransport.isConnected();
        }
        return this.connectionState === 'connected' &&
            this.server !== null &&
            this.server.connected === true;
    }

    // Check if Bluetooth is supported
    public isBluetoothSupported(): boolean {
        const nav = navigator as any;
        return 'bluetooth' in nav;
    }

    // Check if USB is supported
    public isUSBSupported(): boolean {
        return USBPrinterTransport.isSupported();
    }

    public async getPermittedBluetoothDeviceNames(): Promise<string[]> {
        const nav = navigator as any;
        if (!nav.bluetooth || typeof nav.bluetooth.getDevices !== 'function') return [];
        try {
            const devices = await nav.bluetooth.getDevices();
            return (devices || []).map((d: any) => d.name).filter(Boolean);
        } catch (err) {
            console.warn('Unable to read permitted Bluetooth devices:', err);
            return [];
        }
    }

    public async getAvailableBluetoothDeviceNames(): Promise<string[]> {
        const nav = navigator as any;
        if (!nav.bluetooth || typeof nav.bluetooth.getDevices !== 'function') return [];
        try {
            const devices = await nav.bluetooth.getDevices();
            const available: string[] = [];
            for (const device of devices || []) {
                if (!device?.name || !device.gatt) continue;
                try {
                    const server = device.gatt.connected ? device.gatt : await device.gatt.connect();
                    available.push(device.name);
                    if (device !== this.device && server?.connected) {
                        try { server.disconnect(); } catch { /* ignore */ }
                    }
                } catch {
                    // Device is paired/permitted but not reachable right now.
                }
            }
            return available;
        } catch (err) {
            console.warn('Unable to check Bluetooth device availability:', err);
            return [];
        }
    }

    public async isMappedDeviceAvailable(deviceName: string): Promise<boolean> {
        if (!deviceName) return false;
        if (this.deviceName === deviceName && this.isConnected()) return true;
        const names = await this.getAvailableBluetoothDeviceNames();
        return names.includes(deviceName);
    }

    // =============== BLUETOOTH CONNECTION ===============

    // Find previously paired/permitted Web Bluetooth device
    private async findPermittedBluetoothDevice(): Promise<any> {
        const nav = navigator as any;
        if (nav.bluetooth && typeof nav.bluetooth.getDevices === 'function') {
            try {
                const devices = await nav.bluetooth.getDevices();
                if (devices && devices.length > 0) {
                    // Try to find the device that matches the saved printer name
                    const savedPrinterName = localStorage.getItem('hotel_pos_bluetooth_printer_name');
                    if (savedPrinterName) {
                        const matched = devices.find((d: any) => d.name === savedPrinterName);
                        if (matched) {
                            console.log('Found matched permitted Bluetooth device:', matched.name);
                            return matched;
                        }
                    }
                    // Fallback to the first permitted device
                    console.log('Fallback to first permitted Bluetooth device:', devices[0].name);
                    return devices[0];
                }
            } catch (err) {
                console.warn('Error fetching permitted Bluetooth devices:', err);
            }
        }
        return null;
    }

    // Connect to Bluetooth printer (will use cached device if available)
    public async connect(forceNewDevice: boolean = false): Promise<boolean> {
        const nav = navigator as any;

        if (!nav.bluetooth) {
            console.error('Bluetooth not supported');
            this.setState('error');
            return false;
        }

        // If already connected via BT, return true
        if (this._printerType === 'bluetooth' && this.isConnected() && !forceNewDevice) {
            console.log('Already connected to:', this.deviceName);
            return true;
        }

        // Disconnect USB if switching
        if (this._printerType === 'usb' && this.usbTransport.isConnected()) {
            await this.usbTransport.close();
        }

        this.setState('connecting');

        try {
            // If we have a cached device and it's not a forced new connection, try to reconnect
            if (this.device && !forceNewDevice) {
                console.log('Attempting to reconnect to cached device:', this.device.name);
                const reconnected = await this.reconnectToDevice();
                if (reconnected) {
                    this._printerType = 'bluetooth';
                    localStorage.setItem(PRINTER_TYPE_KEY, 'bluetooth');
                    return true;
                }
            }

            // If we don't have a cached device, try to see if there is a previously paired one
            if (!this.device && !forceNewDevice) {
                this.device = await this.findPermittedBluetoothDevice();
                if (this.device) {
                    this.deviceName = this.device.name || 'Bluetooth Printer';
                    // Setup disconnect listener
                    this.device.addEventListener('gattserverdisconnected', () => {
                        console.log('Printer disconnected');
                        this.handleDisconnect();
                    });
                    
                    console.log('Attempting to reconnect to permitted device:', this.deviceName);
                    const reconnected = await this.reconnectToDevice();
                    if (reconnected) {
                        this._printerType = 'bluetooth';
                        localStorage.setItem(PRINTER_TYPE_KEY, 'bluetooth');
                        if (this.deviceName) {
                            localStorage.setItem('hotel_pos_bluetooth_printer_name', this.deviceName);
                        }
                        this.reconnectAttempts = 0;
                        this.setState('connected');
                        this.processQueue();
                        return true;
                    }
                }
            }

            // If we still don't have a connection and forceNewDevice is false, do NOT prompt!
            if (!forceNewDevice) {
                console.log('Reconnection failed and forceNewDevice is false. Bypassing requestDevice prompt.');
                this.setState('disconnected');
                return false;
            }

            // Request new device from user
            console.log('Requesting new Bluetooth device...');
            this.device = await nav.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: BLUETOOTH_OPTIONAL_SERVICES
            });

            if (!this.device) {
                throw new Error('No device selected');
            }

            this.deviceName = this.device.name || 'Bluetooth Printer';

            // Setup disconnect listener
            this.device.addEventListener('gattserverdisconnected', () => {
                console.log('Printer disconnected');
                this.handleDisconnect();
            });

            // Connect to GATT server
            const connected = await this.connectToGATT();

            if (connected) {
                this._printerType = 'bluetooth';
                localStorage.setItem(PRINTER_TYPE_KEY, 'bluetooth');
                if (this.deviceName) {
                    localStorage.setItem('hotel_pos_bluetooth_printer_name', this.deviceName);
                }
                this.reconnectAttempts = 0;
                this.setState('connected');
                this.processQueue();
                return true;
            } else {
                throw new Error('Failed to connect to GATT server');
            }

        } catch (error: any) {
            console.error('Connection error:', error);

            if (error.name === 'NotFoundError' || error.message?.includes('cancelled')) {
                this.setState('disconnected');
            } else {
                this.setState('error');
            }
            return false;
        }
    }

    // =============== USB CONNECTION ===============

    /** Connect to a USB/wired printer */
    public async connectUSB(forceNewDevice: boolean = false): Promise<boolean> {
        if (!USBPrinterTransport.isSupported()) {
            console.error('[USB] WebUSB not supported in this browser');
            this.setState('error');
            return false;
        }

        // If already connected via USB, return true
        if (this._printerType === 'usb' && this.usbTransport.isConnected() && !forceNewDevice) {
            console.log('[USB] Already connected to:', this.usbTransport.getDeviceName());
            return true;
        }

        // Disconnect BT if switching
        if (this._printerType === 'bluetooth' && this.server?.connected) {
            this.server.disconnect();
            this.server = null;
            this.characteristic = null;
        }

        this.setState('connecting');

        try {
            let success = false;

            // Try reconnecting to a previously paired device first
            if (!forceNewDevice) {
                success = await this.usbTransport.reconnect();
            }

            // If reconnect failed and forceNewDevice is false, do NOT prompt!
            if (!success && !forceNewDevice) {
                console.log('[USB] Reconnection failed and forceNewDevice is false. Bypassing prompt.');
                this.setState('disconnected');
                return false;
            }

            // If no paired device or reconnect failed, prompt user (ONLY when forceNewDevice is true)
            if (!success && forceNewDevice) {
                success = await this.usbTransport.requestDevice();
            }

            if (success) {
                this._printerType = 'usb';
                localStorage.setItem(PRINTER_TYPE_KEY, 'usb');
                this.deviceName = this.usbTransport.getDeviceName() || 'USB Printer';
                this.reconnectAttempts = 0;
                this.setState('connected');
                this.processQueue();
                return true;
            } else {
                this.setState('disconnected');
                return false;
            }
        } catch (error: any) {
            console.error('[USB] connectUSB error:', error);
            if (error.name === 'NotFoundError' || error.message?.includes('cancelled')) {
                this.setState('disconnected');
            } else {
                this.setState('error');
            }
            return false;
        }
    }

    /**
     * Auto-connect: tries to reconnect to last used printer type
     * without showing any picker / requiring user gesture.
     * Call this on app startup.
     */
    public async autoReconnect(): Promise<boolean> {
        if (this._printerType === 'usb') {
            const ok = await this.usbTransport.reconnect();
            if (ok) {
                this.deviceName = this.usbTransport.getDeviceName() || 'USB Printer';
                this.setState('connected');
                return true;
            }
        } else if (this._printerType === 'bluetooth') {
            if (!this.device) {
                this.device = await this.findPermittedBluetoothDevice();
                if (this.device) {
                    this.deviceName = this.device.name || 'Bluetooth Printer';
                    // Setup disconnect listener
                    this.device.addEventListener('gattserverdisconnected', () => {
                        console.log('Printer disconnected');
                        this.handleDisconnect();
                    });
                }
            }
            if (this.device) {
                const ok = await this.reconnectToDevice();
                if (ok) {
                    this.setState('connected');
                    return true;
                }
            }
        }
        return false;
    }

    // =============== BLUETOOTH INTERNALS ===============

    private async reconnectToDevice(): Promise<boolean> {
        if (!this.device || !this.device.gatt) {
            return false;
        }

        try {
            return await this.connectToGATT();
        } catch (error) {
            console.error('Reconnection failed:', error);
            return false;
        }
    }

    private async connectToGATT(): Promise<boolean> {
        if (!this.device || !this.device.gatt) {
            return false;
        }

        try {
            this.server = await this.device.gatt.connect();

            if (!this.server) {
                throw new Error('Failed to get GATT server');
            }

            const services = await this.server.getPrimaryServices();

            if (services.length === 0) {
                throw new Error('No services found');
            }

            for (const service of services) {
                const characteristics = await service.getCharacteristics();

                for (const char of characteristics) {
                    if (char.properties.write || char.properties.writeWithoutResponse) {
                        this.characteristic = char;
                        console.log('Found writable characteristic');
                        return true;
                    }
                }
            }

            throw new Error('No writable characteristic found');

        } catch (error) {
            console.error('GATT connection error:', error);
            return false;
        }
    }

    // Handle disconnect event
    private handleDisconnect(): void {
        this.server = null;
        this.characteristic = null;
        this.setState('disconnected');

        if (this.printQueue.length > 0 && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.attemptAutoReconnect();
        }
    }

    // Auto-reconnect with exponential backoff
    private async attemptAutoReconnect(): Promise<void> {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('Max reconnect attempts reached');
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

        console.log(`Auto-reconnect attempt ${this.reconnectAttempts} in ${delay}ms...`);

        await new Promise(resolve => setTimeout(resolve, delay));

        if (this.connectionState !== 'connected') {
            let success = false;
            if (this._printerType === 'usb') {
                success = await this.usbTransport.reconnect();
                if (success) {
                    this.deviceName = this.usbTransport.getDeviceName() || 'USB Printer';
                }
            } else if (this.device) {
                success = await this.reconnectToDevice();
            }

            if (success) {
                this.setState('connected');
                this.reconnectAttempts = 0;
                this.processQueue();
            } else if (this.reconnectAttempts < this.maxReconnectAttempts) {
                this.attemptAutoReconnect();
            }
        }
    }

    // =============== SHARED OPERATIONS ===============

    /** Serialize BLE writes and use conservative packets supported by low-cost printers. */
    private async writeBluetoothBytes(bytesData: Uint8Array): Promise<void> {
        const operation = this.writeChain.then(async () => {
            if (!this.characteristic || !this.isConnected()) {
                throw new Error('Bluetooth printer is not connected');
            }

            for (let i = 0; i < bytesData.length; i += BLUETOOTH_CHUNK_SIZE) {
                const chunk = bytesData.slice(i, Math.min(i + BLUETOOTH_CHUNK_SIZE, bytesData.length));
                if (this.characteristic.properties.writeWithoutResponse) {
                    if (typeof this.characteristic.writeValueWithoutResponse === 'function') {
                        await this.characteristic.writeValueWithoutResponse(chunk);
                    } else {
                        await this.characteristic.writeValue(chunk);
                    }
                } else if (typeof this.characteristic.writeValueWithResponse === 'function') {
                    await this.characteristic.writeValueWithResponse(chunk);
                } else {
                    await this.characteristic.writeValue(chunk);
                }
                if (BLUETOOTH_CHUNK_DELAY_MS > 0) {
                    await new Promise(resolve => setTimeout(resolve, BLUETOOTH_CHUNK_DELAY_MS));
                }
            }
        });

        this.writeChain = operation.catch(() => undefined);
        return operation;
    }

    // Disconnect from printer
    public disconnect(): void {
        if (this._printerType === 'usb') {
            this.usbTransport.close();
        } else {
            if (this.server && this.server.connected) {
                this.server.disconnect();
            }
            this.device = null;
            this.server = null;
            this.characteristic = null;
        }
        this.deviceName = '';
        this._printerType = 'none';
        localStorage.removeItem(PRINTER_TYPE_KEY);
        this.setState('disconnected');
        console.log('Printer disconnected manually');
    }

    // Print receipt — works with both BT and USB
    public async print(data: PrintData): Promise<boolean> {
        // If not connected, try to connect first
        if (!this.isConnected()) {
            console.log('Not connected, attempting to connect...');
            let connected = false;
            if (this._printerType === 'usb') {
                connected = await this.connectUSB();
            } else {
                connected = await this.connect();
            }

            if (!connected) {
                console.log('Connection failed, queueing print job');
                this.printQueue.push(data);
                return false;
            }
        }

        try {
            const receiptBytes = await generateReceiptBytes(data);

            if (this._printerType === 'usb') {
                // USB: use transport
                const ok = await this.usbTransport.write(receiptBytes);
                if (!ok) throw new Error('USB write failed');
            } else {
                // Bluetooth: use characteristic
                if (!this.characteristic) {
                    console.error('No characteristic available');
                    this.printQueue.push(data);
                    return false;
                }

                await this.writeBluetoothBytes(receiptBytes);
            }

            console.log('Print successful!');
            return true;

        } catch (error: any) {
            console.error('Print error:', error);

            if (error.message?.includes('GATT') || error.name === 'NetworkError' || error.message?.includes('USB')) {
                console.log('Connection lost during print, attempting reconnect...');
                this.handleDisconnect();
                this.printQueue.push(data);
                this.attemptAutoReconnect();
            }

            return false;
        }
    }

    // Process queued print jobs
    private async processQueue(): Promise<void> {
        if (this.isProcessingQueue || this.printQueue.length === 0) {
            return;
        }

        this.isProcessingQueue = true;
        console.log(`Processing ${this.printQueue.length} queued print jobs...`);

        while (this.printQueue.length > 0 && this.isConnected()) {
            const job = this.printQueue.shift();
            if (job) {
                await this.print(job);
                if (QUEUE_INTER_JOB_DELAY_MS > 0) {
                    await new Promise(resolve => setTimeout(resolve, QUEUE_INTER_JOB_DELAY_MS));
                }
            }
        }

        this.isProcessingQueue = false;
    }

    // Get queue size
    public getQueueSize(): number {
        return this.printQueue.length;
    }

    // Clear print queue
    public clearQueue(): void {
        this.printQueue = [];
    }

    /**
     * Print raw ESC/POS bytes. If `targetDeviceName` is provided, tries to
     * route to that Bluetooth device (must be pre-permitted via getDevices()).
     * Falls back to the currently connected printer when routing fails.
     * Chunked writes match the main print() flow to keep timing consistent.
     */
    public async printRawBytes(bytesData: Uint8Array, targetDeviceName?: string): Promise<boolean> {
        // Try routed BT print first
        if (targetDeviceName) {
            const nav = navigator as any;
            if (nav.bluetooth && typeof nav.bluetooth.getDevices === 'function') {
                try {
                    const devices = await nav.bluetooth.getDevices();
                    const target = devices?.find((d: any) => d.name === targetDeviceName);
                    if (target && target.gatt) {
                        const server = target.gatt.connected ? target.gatt : await target.gatt.connect();
                        const services = await server.getPrimaryServices();
                        for (const svc of services) {
                            const chars = await svc.getCharacteristics();
                            for (const c of chars) {
                                if (c.properties.write || c.properties.writeWithoutResponse) {
                                    const chunk = 512;
                                    for (let i = 0; i < bytesData.length; i += chunk) {
                                        const slice = bytesData.slice(i, Math.min(i + chunk, bytesData.length));
                                        if (c.properties.writeWithoutResponse) {
                                            await c.writeValueWithoutResponse(slice);
                                        } else {
                                            await c.writeValue(slice);
                                        }
                                        // no artificial delay — rely on BLE flow-control for speed
                                    }
                                    // Keep persistent connection; don't disconnect if it was the active one
                                    if (target !== this.device) {
                                        try { server.disconnect(); } catch { /* ignore */ }
                                    }
                                    return true;
                                }
                            }
                        }
                    }
                } catch (err) {
                    console.warn('[printRawBytes] routed print failed, falling back:', err);
                }
            }
        }

        // Fallback: active printer
        if (!this.isConnected()) {
            const connected = this._printerType === 'usb' ? await this.connectUSB() : await this.connect();
            if (!connected) return false;
        }
        try {
            if (this._printerType === 'usb') {
                return await this.usbTransport.write(bytesData);
            } else if (this.characteristic) {
                await this.writeBluetoothBytes(bytesData);
                return true;
            }
        } catch (err) {
            console.error('[printRawBytes] fallback print failed:', err);
        }
        return false;
    }
}

// Export singleton instance
export const printerManager = PrinterManager.getInstance();

// Export the class for type usage
export { PrinterManager };
