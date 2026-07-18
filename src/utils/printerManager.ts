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
import { Capacitor, registerPlugin } from '@capacitor/core';

export interface BluetoothPrinterPlugin {
  printRaw(options: { hex: string, address?: string }): Promise<{ success: boolean }>;
  getPairedDevices(): Promise<{ devices: Array<{ name: string, address: string }> }>;
  connectSavedPrinter(options: { address?: string }): Promise<{ success: boolean; name?: string; address?: string; serviceUuid?: string }>;
  getConnectionStatus(): Promise<{ connected: boolean; name?: string; address?: string }>;
  disconnect(): Promise<void>;
}

const BluetoothPrinter = registerPlugin<BluetoothPrinterPlugin>('BluetoothPrinter');

// Connection states
export type PrinterConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';
export type PrinterType = 'bluetooth' | 'usb' | 'none';
export type AutoReconnectState = 'off' | 'waiting' | 'reconnecting' | 'connected';
export type ReconnectFailureReason = 'none' | 'permission-blocked' | 'device-not-found' | 'service-mismatch' | 'gatt-disconnected' | 'browser-unsupported' | 'native-unavailable' | 'unknown';
export interface ReconnectStatus { attempt: number; reason: ReconnectFailureReason; detail: string; nextRetryMs?: number; updatedAt: number; }

export interface PrintLogEntry {
    ts: number;
    action: 'print' | 'test' | 'self-test' | 'connect' | 'reconnect' | 'disconnect' | 'error' | 'retry';
    status: 'ok' | 'fail' | 'info';
    ms?: number;
    detail?: string;
    billNo?: string;
}

// Event types
type ConnectionListener = (state: PrinterConnectionState, deviceName?: string, autoReconnectState?: AutoReconnectState) => void;
type LogListener = (log: PrintLogEntry[]) => void;

const PRINTER_TYPE_KEY = 'hotel_pos_printer_type';
const BLUETOOTH_DEVICE_NAME_KEY = 'hotel_pos_bluetooth_printer_name';
const BLUETOOTH_DEVICE_ID_KEY = 'hotel_pos_bluetooth_printer_id';
const AUTO_RECONNECT_KEY = 'hotel_pos_printer_auto_reconnect';
const BLUETOOTH_SERVICE_UUID_KEY = 'hotel_pos_bluetooth_service_uuid';
const BLUETOOTH_CHARACTERISTIC_UUID_KEY = 'hotel_pos_bluetooth_characteristic_uuid';
const BLUETOOTH_TRUSTED_KEY = 'hotel_pos_bluetooth_trusted';
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
const BLUETOOTH_CHUNK_SIZE = 40;
const BLUETOOTH_CHUNK_DELAY_MS = 15;
const QUEUE_INTER_JOB_DELAY_MS = 100;
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
    private logListeners: Set<LogListener> = new Set();

    // Telemetry
    private serviceUUID: string = '';
    private characteristicUUID: string = '';
    private lastError: string = '';
    private printLog: PrintLogEntry[] = [];

    // Reconnection settings — exponential backoff, capped
    private reconnectAttempts: number = 0;
    private maxReconnectAttempts: number = 10;
    private reconnectDelay: number = 800;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private reconnectPromise: Promise<boolean> | null = null;
    private autoReconnectState: AutoReconnectState = 'off';
    private reconnectStatus: ReconnectStatus = { attempt: 0, reason: 'none', detail: 'No reconnect attempt yet', updatedAt: Date.now() };
    private reconnectEnabled: boolean = false;
    private disconnectHandlers = new WeakSet<object>();
    private healthCheckTimer: ReturnType<typeof setInterval> | null = null;

    // Print queue for offline/disconnected scenarios
    private printQueue: PrintData[] = [];
    private isProcessingQueue: boolean = false;
    private writeChain: Promise<void> = Promise.resolve();
    private lastPrintData: PrintData | null = null;
    private lastPrintFailed: boolean = false;
    private nativeConnected: boolean = false;

    private constructor() {
        // Restore saved printer type
        const saved = localStorage.getItem(PRINTER_TYPE_KEY);
        if (saved === 'bluetooth' || saved === 'usb') {
            this._printerType = saved;
            this.deviceName = localStorage.getItem(BLUETOOTH_DEVICE_NAME_KEY) || '';
            this.serviceUUID = localStorage.getItem(BLUETOOTH_SERVICE_UUID_KEY) || '';
            this.characteristicUUID = localStorage.getItem(BLUETOOTH_CHARACTERISTIC_UUID_KEY) || '';
            this.reconnectEnabled = localStorage.getItem(AUTO_RECONNECT_KEY) !== 'false';
            this.autoReconnectState = 'waiting';
            // Attempt background reconnection
            setTimeout(() => {
                this.requestImmediateReconnect().catch(err => {
                    this.recordLog('reconnect', 'fail', undefined, String(err?.message || err));
                });
            }, 500);
        }

        // Restore print queue from persistent storage
        try {
            const savedQueue = localStorage.getItem('hotel_pos_print_queue');
            if (savedQueue) {
                this.printQueue = JSON.parse(savedQueue);
                console.log(`[Printer] Restored ${this.printQueue.length} print jobs from storage`);
            }
        } catch (e) {
            console.error('Failed to restore print queue:', e);
        }

        // Re-establish printer whenever the tab becomes visible or window regains focus.
        // Keeps the printer "always connected" across app close/reopen, route changes,
        // screen locks, and background/foreground transitions on mobile.
        if (typeof window !== 'undefined') {
            const tryReconnect = () => {
                if (this.reconnectEnabled && this._printerType !== 'none' && !this.isConnected()) {
                    this.requestImmediateReconnect().catch(() => undefined);
                }
            };
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') tryReconnect();
            });
            window.addEventListener('focus', tryReconnect);
            window.addEventListener('online', tryReconnect);
            window.addEventListener('pageshow', tryReconnect);
            // Android may suspend a PWA without firing a disconnect event. This
            // lightweight check repairs that stale link while the POS is visible.
            this.healthCheckTimer = setInterval(() => {
                if (document.visibilityState === 'visible') tryReconnect();
            }, 15_000);
        }
    }

    private saveQueueToStorage(): void {
        try {
            localStorage.setItem('hotel_pos_print_queue', JSON.stringify(this.printQueue));
        } catch (e) {
            console.error('Failed to save print queue:', e);
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
        listener(this.connectionState, this.deviceName, this.autoReconnectState);
        // Return unsubscribe function
        return () => this.listeners.delete(listener);
    }

    private notifyListeners(): void {
        this.listeners.forEach(listener => listener(this.connectionState, this.deviceName, this.autoReconnectState));
    }

    // ============ Telemetry / logging ============
    public subscribeLog(listener: LogListener): () => void {
        this.logListeners.add(listener);
        listener([...this.printLog]);
        return () => this.logListeners.delete(listener);
    }

    private notifyLogListeners(): void {
        const snapshot = [...this.printLog];
        this.logListeners.forEach(l => l(snapshot));
    }

    private recordLog(
        action: PrintLogEntry['action'],
        status: PrintLogEntry['status'],
        ms?: number,
        detail?: string,
        billNo?: string
    ): void {
        const entry: PrintLogEntry = { ts: Date.now(), action, status, ms, detail, billNo };
        this.printLog.unshift(entry);
        if (this.printLog.length > MAX_LOG_ENTRIES) this.printLog.length = MAX_LOG_ENTRIES;
        if (status === 'fail' && detail) this.lastError = detail;
        this.notifyLogListeners();
    }

    public getPrintLog(): PrintLogEntry[] {
        return [...this.printLog];
    }

    public clearPrintLog(): void {
        this.printLog = [];
        this.notifyLogListeners();
    }

    public getLastError(): string {
        return this.lastError;
    }

    public getServiceInfo(): { serviceUUID: string; characteristicUUID: string } {
        return { serviceUUID: this.serviceUUID, characteristicUUID: this.characteristicUUID };
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

    public getAutoReconnectState(): AutoReconnectState {
        return this.autoReconnectState;
    }

    public getReconnectStatus(): ReconnectStatus { return { ...this.reconnectStatus }; }
    public isPrinterTrusted(): boolean { return localStorage.getItem(BLUETOOTH_TRUSTED_KEY) === 'true'; }
    public hasNativePrinterBridge(): boolean { return typeof window !== 'undefined' && (!!(window as any).AndroidPrinter || Capacitor.isNativePlatform()); }

    public async getNativePairedDevices(): Promise<Array<{ name: string, address: string }>> {
        if (Capacitor.isNativePlatform()) {
            try {
                const result = await BluetoothPrinter.getPairedDevices();
                return result.devices || [];
            } catch (e) {
                console.error("Failed to get paired devices", e);
                return [];
            }
        }
        return [];
    }

    private updateReconnectStatus(reason: ReconnectFailureReason, detail: string, nextRetryMs?: number): void {
        this.reconnectStatus = { attempt: this.reconnectAttempts, reason, detail, nextRetryMs, updatedAt: Date.now() };
        this.notifyListeners();
    }

    private classifyReconnectError(error: any): { reason: ReconnectFailureReason; detail: string } {
        const name = String(error?.name || '');
        const message = String(error?.message || error || 'Unknown Bluetooth error');
        if (name === 'SecurityError' || name === 'NotAllowedError' || /permission|access denied|not allowed/i.test(message)) return { reason: 'permission-blocked', detail: 'Browser permission is blocked or was revoked. Use Trust this printer once.' };
        if (name === 'NotFoundError' || /not found|no permitted|no device/i.test(message)) return { reason: 'device-not-found', detail: 'Saved printer is not in this browser’s authorized device list.' };
        if (/service|characteristic|uuid/i.test(message)) return { reason: 'service-mismatch', detail: `Saved printer service is unavailable: ${message}` };
        if (/gatt|network|disconnected|connect/i.test(message)) return { reason: 'gatt-disconnected', detail: `Printer is authorized but its GATT link is unavailable: ${message}` };
        return { reason: 'unknown', detail: message };
    }

    public isAutoReconnectEnabled(): boolean {
        return this.reconnectEnabled;
    }

    private setAutoReconnectState(state: AutoReconnectState): void {
        this.autoReconnectState = state;
        this.notifyListeners();
    }

    private enableAutoReconnect(): void {
        this.reconnectEnabled = true;
        localStorage.setItem(AUTO_RECONNECT_KEY, 'true');
    }

    private attachDisconnectHandler(device: any): void {
        if (!device || this.disconnectHandlers.has(device)) return;
        device.addEventListener('gattserverdisconnected', () => this.handleDisconnect());
        this.disconnectHandlers.add(device);
    }

    public get printerType(): PrinterType {
        return this._printerType;
    }

    public isConnected(): boolean {
        if (this._printerType === 'usb') {
            return this.connectionState === 'connected' && this.usbTransport.isConnected();
        }
        if (Capacitor.isNativePlatform()) {
            return this.connectionState === 'connected' && this.nativeConnected;
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
                    const savedDeviceId = localStorage.getItem(BLUETOOTH_DEVICE_ID_KEY);
                    const savedPrinterName = localStorage.getItem(BLUETOOTH_DEVICE_NAME_KEY);
                    if (savedDeviceId) {
                        const matchedById = devices.find((d: any) => d.id === savedDeviceId);
                        if (matchedById) return matchedById;
                    }
                    if (savedPrinterName) {
                        const matched = devices.find((d: any) => d.name === savedPrinterName);
                        if (matched) {
                            console.log('Found matched permitted Bluetooth device:', matched.name);
                            return matched;
                        }
                    }
                    this.updateReconnectStatus('device-not-found', 'The saved printer is not present in the browser’s authorized device list.');
                    return null;
                }
            } catch (err) {
                console.warn('Error fetching permitted Bluetooth devices:', err);
                const failure = this.classifyReconnectError(err);
                this.updateReconnectStatus(failure.reason, failure.detail);
            }
        } else {
            this.updateReconnectStatus('browser-unsupported', 'This browser cannot restore authorized Bluetooth devices after reopen. Use the native Android bridge.');
        }
        return null;
    }

    // Connect to Bluetooth printer (will use cached device if available)
    public async connect(forceNewDevice: boolean = false): Promise<boolean> {
        if (Capacitor.isNativePlatform()) {
            this._printerType = 'bluetooth';
            this.enableAutoReconnect();
            localStorage.setItem(PRINTER_TYPE_KEY, 'bluetooth');
            this.setState('connecting');
            this.setAutoReconnectState('reconnecting');
            try {
                const address = localStorage.getItem('hotel_pos_bluetooth_printer_address') || '';
                const result = await BluetoothPrinter.connectSavedPrinter({ address });
                this.nativeConnected = result.success === true;
                if (!this.nativeConnected) throw new Error('Native printer did not confirm connection');
                this.deviceName = result.name || localStorage.getItem(BLUETOOTH_DEVICE_NAME_KEY) || 'Android printer';
                if (result.address) localStorage.setItem('hotel_pos_bluetooth_printer_address', result.address);
                if (result.serviceUuid) this.serviceUUID = result.serviceUuid;
                this.reconnectAttempts = 0;
                this.setState('connected');
                this.setAutoReconnectState('connected');
                this.updateReconnectStatus('none', 'Native Bluetooth socket connected.');
                this.processQueue();
                return true;
            } catch (error: any) {
                this.nativeConnected = false;
                const detail = String(error?.message || error || 'Printer not connected');
                this.recordLog('connect', 'fail', undefined, detail);
                this.updateReconnectStatus(/permission/i.test(detail) ? 'permission-blocked' : 'native-unavailable', detail);
                this.setState('disconnected');
                this.setAutoReconnectState('waiting');
                return false;
            }
        }
        if (typeof (window as any).AndroidPrinter !== 'undefined') {
            this._printerType = 'bluetooth';
            this.enableAutoReconnect();
            localStorage.setItem(PRINTER_TYPE_KEY, 'bluetooth');
            this.deviceName = 'Native Android Printer';
            this.reconnectAttempts = 0;
            this.setState('connected');
            this.setAutoReconnectState('connected');
            return true;
        }

        const nav = navigator as any;

        if (!nav.bluetooth) {
            console.error('Bluetooth not supported');
            this.setState('error');
            this.updateReconnectStatus('browser-unsupported', 'Web Bluetooth is not supported in this browser.');
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
        this.setAutoReconnectState('reconnecting');

        try {
            // If we have a cached device and it's not a forced new connection, try to reconnect
            if (this.device && !forceNewDevice) {
                console.log('Attempting to reconnect to cached device:', this.device.name);
                const reconnected = await this.reconnectToDevice();
                if (reconnected) {
                    this._printerType = 'bluetooth';
                    this.enableAutoReconnect();
                    localStorage.setItem(PRINTER_TYPE_KEY, 'bluetooth');
                    this.reconnectAttempts = 0;
                    this.setState('connected');
                    this.setAutoReconnectState('connected');
                    this.processQueue();
                    return true;
                }
            }

            // If we don't have a cached device, try to see if there is a previously paired one
            if (!this.device && !forceNewDevice) {
                this.device = await this.findPermittedBluetoothDevice();
                if (this.device) {
                    this.deviceName = this.device.name || 'Bluetooth Printer';
                    // Setup disconnect listener
                    this.attachDisconnectHandler(this.device);
                    
                    console.log('Attempting to reconnect to permitted device:', this.deviceName);
                    const reconnected = await this.reconnectToDevice();
                    if (reconnected) {
                        this._printerType = 'bluetooth';
                        this.enableAutoReconnect();
                        localStorage.setItem(PRINTER_TYPE_KEY, 'bluetooth');
                        if (this.deviceName) {
                            localStorage.setItem('hotel_pos_bluetooth_printer_name', this.deviceName);
                        }
                        this.reconnectAttempts = 0;
                        this.setState('connected');
                        this.setAutoReconnectState('connected');
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
            this.attachDisconnectHandler(this.device);

            // Connect to GATT server
            const connected = await this.connectToGATT();

            if (connected) {
                this._printerType = 'bluetooth';
                this.enableAutoReconnect();
                localStorage.setItem(PRINTER_TYPE_KEY, 'bluetooth');
                if (this.deviceName) {
                    localStorage.setItem('hotel_pos_bluetooth_printer_name', this.deviceName);
                }
                if (this.device.id) localStorage.setItem(BLUETOOTH_DEVICE_ID_KEY, this.device.id);
                localStorage.setItem(BLUETOOTH_TRUSTED_KEY, 'true');
                this.reconnectAttempts = 0;
                this.setState('connected');
                this.setAutoReconnectState('connected');
                this.processQueue();
                return true;
            } else {
                throw new Error('Failed to connect to GATT server');
            }

        } catch (error: any) {
            console.error('Connection error:', error);
            const failure = this.classifyReconnectError(error);
            this.updateReconnectStatus(failure.reason, failure.detail);

            if (error.name === 'NotFoundError' || error.message?.includes('cancelled')) {
                this.setState('disconnected');
                this.setAutoReconnectState(this.reconnectEnabled ? 'waiting' : 'off');
            } else {
                this.setState('error');
            }
            return false;
        }
    }

    public async trustPrinter(): Promise<boolean> {
        this.updateReconnectStatus('none', 'Waiting for one-time printer authorization…');
        const ok = await this.connect(true);
        if (ok) this.updateReconnectStatus('none', 'Printer authorized. Silent reconnect is enabled for this browser.');
        return ok;
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
                this.enableAutoReconnect();
                localStorage.setItem(PRINTER_TYPE_KEY, 'usb');
                this.deviceName = this.usbTransport.getDeviceName() || 'USB Printer';
                this.reconnectAttempts = 0;
                this.setState('connected');
                this.setAutoReconnectState('connected');
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
        if (!this.reconnectEnabled || this._printerType === 'none') return false;
        if (this.isConnected()) {
            this.setAutoReconnectState('connected');
            return true;
        }
        if (this.reconnectPromise) return this.reconnectPromise;

        this.reconnectPromise = this.performAutoReconnect();
        try {
            return await this.reconnectPromise;
        } finally {
            this.reconnectPromise = null;
        }
    }

    private async performAutoReconnect(): Promise<boolean> {
        this.setState('connecting');
        this.setAutoReconnectState('reconnecting');
        let connected = false;
        if (this._printerType === 'usb') {
            const ok = await this.usbTransport.reconnect();
            if (ok) {
                this.deviceName = this.usbTransport.getDeviceName() || 'USB Printer';
                this.setState('connected');
                connected = true;
        }
        }
        if (this._printerType === 'bluetooth') {
            if (this.hasNativePrinterBridge()) {
                try {
                    const bridge = (window as any).AndroidPrinter;
                    
                    let ok = false;
                    if (Capacitor.isNativePlatform()) {
                        const address = localStorage.getItem('hotel_pos_bluetooth_printer_address') || '';
                        const result = await BluetoothPrinter.connectSavedPrinter({ address });
                        ok = result.success === true;
                        this.nativeConnected = ok;
                        this.deviceName = result.name || this.deviceName || 'Android printer';
                        if (result.address) localStorage.setItem('hotel_pos_bluetooth_printer_address', result.address);
                    } else {
                        const result = typeof bridge?.connectSavedPrinter === 'function' ? bridge.connectSavedPrinter() : true;
                        ok = result instanceof Promise ? await result : result !== false;
                    }
                    
                    if (ok) {
                        this.deviceName = this.deviceName || 'Android printer';
                        this.setState('connected');
                        this.updateReconnectStatus('none', 'Connected through native Android printer bridge.');
                        connected = true;
                    }
                } catch (error: any) {
                    this.updateReconnectStatus('native-unavailable', `Native printer bridge failed: ${String(error?.message || error)}`);
                }
            }
            if (connected) {
                this.reconnectAttempts = 0;
                this.setAutoReconnectState('connected');
                return true;
            }
            if (!this.device) {
                this.device = await this.findPermittedBluetoothDevice();
                if (this.device) {
                    this.deviceName = this.device.name || 'Bluetooth Printer';
                    // Setup disconnect listener
                    this.attachDisconnectHandler(this.device);
                }
            }
            if (this.device) {
                const ok = await this.reconnectToDevice();
                if (ok) {
                    this.setState('connected');
                    connected = true;
                }
            } else if (this.reconnectStatus.reason === 'none') {
                this.updateReconnectStatus('device-not-found', 'No authorized saved printer was returned by this browser.');
            }
        }
        if (connected) {
            this.reconnectAttempts = 0;
            this.setAutoReconnectState('connected');
            this.processQueue();
            return true;
        }
        this.setState('disconnected');
        this.setAutoReconnectState('waiting');
        return false;
    }

    private async requestImmediateReconnect(): Promise<boolean> {
        if (this.reconnectPromise) return this.reconnectPromise;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        const ok = await this.autoReconnect();
        if (!ok && this.reconnectEnabled) this.attemptAutoReconnect();
        return ok;
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

            if (this.serviceUUID && this.characteristicUUID) {
                try {
                    const savedService = await this.server.getPrimaryService(this.serviceUUID);
                    const savedCharacteristic = await savedService.getCharacteristic(this.characteristicUUID);
                    if (savedCharacteristic.properties.write || savedCharacteristic.properties.writeWithoutResponse) {
                        this.characteristic = savedCharacteristic;
                        this.recordLog('connect', 'ok', undefined, `restored svc=${this.serviceUUID}`);
                        this.updateReconnectStatus('none', 'GATT connected using saved service metadata.');
                        return true;
                    }
                } catch {
                    this.recordLog('reconnect', 'info', undefined, 'Saved GATT metadata unavailable; validating authorized services');
                }
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
                        this.serviceUUID = service.uuid || '';
                        this.characteristicUUID = char.uuid || '';
                        localStorage.setItem(BLUETOOTH_SERVICE_UUID_KEY, this.serviceUUID);
                        localStorage.setItem(BLUETOOTH_CHARACTERISTIC_UUID_KEY, this.characteristicUUID);
                        this.recordLog('connect', 'ok', undefined, `svc=${this.serviceUUID}`);
                        console.log('Found writable characteristic on service', this.serviceUUID);
                        this.updateReconnectStatus('none', 'GATT connected and writable service verified.');
                        return true;
                    }
                }
            }

            throw new Error('No writable characteristic found');

        } catch (error: any) {
            this.recordLog('connect', 'fail', undefined, String(error?.message || error));
            console.error('GATT connection error:', error);
            const failure = this.classifyReconnectError(error);
            this.updateReconnectStatus(failure.reason, failure.detail);
            return false;
        }
    }

    // Handle disconnect event
    private handleDisconnect(): void {
        this.nativeConnected = false;
        this.server = null;
        this.characteristic = null;
        this.setState('disconnected');
        this.recordLog('disconnect', 'info', undefined, this.deviceName);

        // A dropped link is different from an explicit user disconnect.
        if (this.reconnectEnabled) {
            this.setAutoReconnectState('waiting');
            this.attemptAutoReconnect();
        } else {
            this.setAutoReconnectState('off');
        }
    }

    // Auto-reconnect with exponential backoff (capped, guarded by timer)
    private async attemptAutoReconnect(): Promise<void> {
        if (this.reconnectTimer) return; // Already scheduled
        if (!this.reconnectEnabled || this._printerType === 'none') return;

        // Permission and browser-capability failures cannot recover in a timer loop.
        // Keep the saved printer, but wait for the user's Trust/Connect gesture.
        if (this.reconnectStatus.reason === 'permission-blocked' || this.reconnectStatus.reason === 'browser-unsupported') {
            this.setState('disconnected');
            this.setAutoReconnectState('waiting');
            return;
        }

        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.updateReconnectStatus(
                this.reconnectStatus.reason === 'none' ? 'gatt-disconnected' : this.reconnectStatus.reason,
                `Automatic reconnect paused after ${this.maxReconnectAttempts} attempts. Tap Connect to retry now.`
            );
            this.setState('disconnected');
            this.setAutoReconnectState('waiting');
            return;
        }

        this.reconnectAttempts++;
        const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30_000);
        const reason = this.reconnectStatus.reason === 'none' ? 'gatt-disconnected' : this.reconnectStatus.reason;
        const detail = this.reconnectStatus.detail || 'Connection dropped';
        this.updateReconnectStatus(reason, detail, delay);
        this.recordLog('reconnect', 'info', delay, `attempt ${this.reconnectAttempts}: ${reason} — ${detail}`);

        this.reconnectTimer = setTimeout(async () => {
            this.reconnectTimer = null;
            if (this.connectionState === 'connected') return;

            let success = false;
            const t0 = performance.now();
            try {
                // All reconnect paths share the same promise mutex, preventing focus,
                // pageshow and health-check events from racing one GATT connection.
                success = await this.autoReconnect();
            } catch (err: any) {
                this.recordLog('reconnect', 'fail', undefined, String(err?.message || err));
            }

            if (success) {
                this.setState('connected');
                this.reconnectAttempts = 0;
                this.recordLog('reconnect', 'ok', Math.round(performance.now() - t0));
                this.setAutoReconnectState('connected');
                this.processQueue();
            } else if (this.reconnectEnabled) {
                this.setState('disconnected');
                this.setAutoReconnectState('waiting');
                this.attemptAutoReconnect();
            }
        }, delay);
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
        // Disable reconnect before closing GATT because disconnect() synchronously
        // emits gattserverdisconnected in Chromium.
        this.reconnectEnabled = false;
        localStorage.setItem(AUTO_RECONNECT_KEY, 'false');
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
        if (Capacitor.isNativePlatform()) {
            BluetoothPrinter.disconnect().catch(() => undefined);
            this.nativeConnected = false;
        }
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
        localStorage.removeItem(BLUETOOTH_DEVICE_ID_KEY);
        localStorage.removeItem(BLUETOOTH_DEVICE_NAME_KEY);
        localStorage.removeItem(BLUETOOTH_SERVICE_UUID_KEY);
        localStorage.removeItem(BLUETOOTH_CHARACTERISTIC_UUID_KEY);
        localStorage.removeItem(BLUETOOTH_TRUSTED_KEY);
        this.setState('disconnected');
        this.setAutoReconnectState('off');
        console.log('Printer disconnected manually');
    }

    // Print receipt — works with both BT and USB, and supports Android Wrapper JS Bridge
    public async print(data: PrintData): Promise<boolean> {
        this.lastPrintData = data;
        this.lastPrintFailed = false;

        // === NATIVE WRAPPER JS BRIDGE (INSTANT PRINT FOR POS TERMINALS) ===
        const win = window as any;
        if (win.AndroidPrinter || Capacitor.isNativePlatform()) {
            console.log('[Printer] Native JS Bridge or Capacitor detected. Routing to built-in printer.');
            const t0 = performance.now();
            try {
                // Capacitor Flow
                if (Capacitor.isNativePlatform()) {
                    if (!this.nativeConnected && !(await this.connect())) throw new Error('Printer not connected');
                    const receiptBytes = await generateReceiptBytes(data);
                    const hex = Array.from(receiptBytes).map(b => b.toString(16).padStart(2, '0')).join('');
                    
                    const savedPrinterAddress = localStorage.getItem('hotel_pos_bluetooth_printer_address') || '';
                    await BluetoothPrinter.printRaw({ hex, address: savedPrinterAddress });
                    this.nativeConnected = true;
                } 
                // Legacy Android WebView Flow
                else if (typeof win.AndroidPrinter.printReceipt === 'function') {
                    win.AndroidPrinter.printReceipt(JSON.stringify(data));
                } else if (typeof win.AndroidPrinter.printRawBytes === 'function') {
                    const receiptBytes = await generateReceiptBytes(data);
                    const hex = Array.from(receiptBytes).map(b => b.toString(16).padStart(2, '0')).join('');
                    win.AndroidPrinter.printRawBytes(hex);
                } else {
                    throw new Error('No valid print method on AndroidPrinter bridge');
                }

                const ms = Math.round(performance.now() - t0);
                this.recordLog('print', 'ok', ms, `Instant POS Print (Native Bridge)`, data.billNo);
                return true;
            } catch (error: any) {
                const ms = Math.round(performance.now() - t0);
                const msg = String(error?.message || error);
                console.error('[Printer] Native bridge print failed:', error);
                this.recordLog('print', 'fail', ms, `Bridge error: ${msg}`, data.billNo);
                this.nativeConnected = false;
                this.setState('disconnected');
                this.setAutoReconnectState('waiting');
                if (Capacitor.isNativePlatform()) {
                    if (!this.printQueue.some(job => job.billNo === data.billNo)) this.printQueue.push(data);
                    this.saveQueueToStorage();
                    this.lastPrintFailed = true;
                    this.attemptAutoReconnect();
                    return false;
                }
                // Legacy wrappers can still fall over to the Web Bluetooth flow.
            }
        }

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
                this.saveQueueToStorage();
                this.lastPrintFailed = true;
                this.recordLog('print', 'fail', 0, 'queued — no connection', data.billNo);
                return false;
            }
        }

        const t0 = performance.now();
        try {
            const receiptBytes = await generateReceiptBytes(data);

            if (this._printerType === 'usb') {
                const ok = await this.usbTransport.write(receiptBytes);
                if (!ok) throw new Error('USB write failed');
            } else {
                if (!this.characteristic) {
                    this.recordLog('print', 'fail', undefined, 'No characteristic', data.billNo);
                    this.printQueue.push(data);
                    this.saveQueueToStorage();
                    return false;
                }
                await this.writeBluetoothBytes(receiptBytes);
            }

            const ms = Math.round(performance.now() - t0);
            this.recordLog('print', 'ok', ms, `${receiptBytes.length}B → ${this.deviceName}`, data.billNo);
            return true;

        } catch (error: any) {
            const ms = Math.round(performance.now() - t0);
            const msg = String(error?.message || error);
            this.lastPrintFailed = true;
            this.recordLog('print', 'fail', ms, msg, data.billNo);
            console.error('Print error:', error);

            if (msg.includes('GATT') || error.name === 'NetworkError' || msg.includes('USB')) {
                this.handleDisconnect();
                this.printQueue.push(data);
                this.saveQueueToStorage();
                this.attemptAutoReconnect();
            }

            return false;
        }
    }

    /** Retry the last bill (from lastPrintData or oldest queued). Used by POS "Retry" button. */
    public async retryLastPrint(): Promise<{ ok: boolean; billNo?: string; error?: string }> {
        const job = this.lastPrintData || this.printQueue[0] || null;
        if (!job) {
            this.recordLog('retry', 'fail', 0, 'no previous bill to retry');
            return { ok: false, error: 'No previous bill to retry' };
        }
        this.recordLog('retry', 'info', undefined, 'reprinting last bill', job.billNo);
        const ok = await this.print(job);
        return ok ? { ok: true, billNo: job.billNo } : { ok: false, billNo: job.billNo, error: this.lastError };
    }

    public getLastPrintData(): PrintData | null {
        return this.lastPrintData;
    }

    // Process queued print jobs
    private async processQueue(): Promise<void> {
        if (this.isProcessingQueue) {
            return;
        }

        // Auto-reprint last failed bill upon successful reconnect if the print queue is empty
        if (this.printQueue.length === 0) {
            if (this.lastPrintFailed && this.lastPrintData && this.isConnected()) {
                console.log('[Printer] Auto-reprinting last failed bill after reconnect:', this.lastPrintData.billNo);
                this.lastPrintFailed = false; // reset to avoid infinite loop
                this.recordLog('reconnect', 'info', undefined, `Auto-reprinting bill #${this.lastPrintData.billNo}`);
                await this.print(this.lastPrintData);
            }
            return;
        }

        this.isProcessingQueue = true;
        console.log(`Processing ${this.printQueue.length} queued print jobs...`);

        while (this.printQueue.length > 0 && this.isConnected()) {
            const job = this.printQueue.shift();
            this.saveQueueToStorage();
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
        localStorage.removeItem('hotel_pos_print_queue');
    }

    /**
     * Print raw ESC/POS bytes. If `targetDeviceName` is provided, tries to
     * route to that Bluetooth device (must be pre-permitted via getDevices()).
     * Falls back to the currently connected printer when routing fails.
     * Chunked writes match the main print() flow to keep timing consistent.
     */
    public async printRawBytes(bytesData: Uint8Array, targetDeviceName?: string): Promise<boolean> {
        if (Capacitor.isNativePlatform()) {
            try {
                if (!this.nativeConnected && !(await this.connect())) return false;
                const hex = Array.from(bytesData).map(b => b.toString(16).padStart(2, '0')).join('');
                const address = localStorage.getItem('hotel_pos_bluetooth_printer_address') || '';
                await BluetoothPrinter.printRaw({ hex, address });
                this.nativeConnected = true;
                return true;
            } catch (error: any) {
                this.nativeConnected = false;
                this.setState('disconnected');
                this.recordLog('error', 'fail', undefined, `Native raw print failed: ${String(error?.message || error)}`);
                this.attemptAutoReconnect();
                return false;
            }
        }
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

    // =============== TEST PRINT / SELF-TEST / DIAGNOSTICS ===============

    /** Sends a small sample receipt and reports success/failure. */
    public async sendTestPrint(): Promise<{ ok: boolean; ms: number; error?: string }> {
        const t0 = performance.now();
        if (!this.isConnected()) {
            let connected = false;
            if (this.hasNativePrinterBridge()) {
                connected = await this.connect();
            } else {
                connected = this._printerType === 'usb' ? await this.connectUSB() : await this.connect();
            }
            if (!connected) {
                const err = 'Printer not connected';
                this.recordLog('test', 'fail', 0, err);
                return { ok: false, ms: 0, error: err };
            }
        }
        try {
            const enc = new TextEncoder();
            const bytes = new Uint8Array([
                0x1B, 0x40, // INIT
                0x1B, 0x61, 0x01, // center
                ...enc.encode('*** TEST PRINT ***\n'),
                ...enc.encode(new Date().toLocaleString() + '\n'),
                ...enc.encode(`Printer: ${this.deviceName || 'Unknown'}\n`),
                ...enc.encode('Bluetooth write OK\n\n\n'),
                0x1D, 0x56, 0x00 // full cut
            ]);
            if (Capacitor.isNativePlatform()) {
                const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
                const address = localStorage.getItem('hotel_pos_bluetooth_printer_address') || '';
                await BluetoothPrinter.printRaw({ hex, address });
                this.nativeConnected = true;
            } else if (this._printerType === 'usb') {
                const ok = await this.usbTransport.write(bytes);
                if (!ok) throw new Error('USB write failed');
            } else {
                await this.writeBluetoothBytes(bytes);
            }
            const ms = Math.round(performance.now() - t0);
            this.recordLog('test', 'ok', ms, `${bytes.length}B → ${this.deviceName}`);
            return { ok: true, ms };
        } catch (err: any) {
            const ms = Math.round(performance.now() - t0);
            const msg = String(err?.message || err);
            this.recordLog('test', 'fail', ms, msg);
            return { ok: false, ms, error: msg };
        }
    }

    /** Runs a full diagnostics sweep and returns a step-by-step report. */
    public async runDiagnostics(): Promise<Array<{ step: string; ok: boolean; detail?: string }>> {
        const report: Array<{ step: string; ok: boolean; detail?: string }> = [];
        const nav = navigator as any;

        if (Capacitor.isNativePlatform()) {
            let nativeStatus: { connected: boolean; name?: string; address?: string } = { connected: false, name: '', address: '' };
            try { nativeStatus = await BluetoothPrinter.getConnectionStatus(); } catch { /* reported below */ }
            this.nativeConnected = nativeStatus.connected;
            report.push({ step: 'Native Android Bridge', ok: true, detail: 'active' });
            report.push({ step: 'Native Bluetooth Socket', ok: nativeStatus.connected, detail: nativeStatus.connected ? `${nativeStatus.name || 'Printer'} connected` : 'printer not connected — automatic reconnect will retry' });
        } else {
            report.push({ step: 'Web Bluetooth API', ok: !!nav.bluetooth, detail: nav.bluetooth ? 'supported' : 'not supported by browser' });
        }
        report.push({ step: 'HTTPS / Secure Context', ok: typeof window !== 'undefined' ? window.isSecureContext : false, detail: window.isSecureContext ? 'ok' : 'must be HTTPS' });

        const permitted = Capacitor.isNativePlatform()
            ? (await this.getNativePairedDevices()).map(device => device.name)
            : await this.getPermittedBluetoothDeviceNames();
        report.push({ step: 'Paired Devices', ok: permitted.length > 0, detail: permitted.length ? permitted.join(', ') : 'none paired in Android settings' });

        report.push({ step: 'Active Printer', ok: !!this.deviceName, detail: this.deviceName || 'not selected' });
        report.push({ step: 'Trusted Authorization', ok: this.isPrinterTrusted() || this.hasNativePrinterBridge(), detail: this.hasNativePrinterBridge() ? 'native Android bridge' : (this.isPrinterTrusted() ? 'saved for silent reconnect' : 'tap Trust this printer once') });
        report.push({ step: 'Reconnect Reason', ok: this.reconnectStatus.reason === 'none', detail: `${this.reconnectStatus.reason}: ${this.reconnectStatus.detail}` });
        report.push({ step: 'GATT Connected', ok: this.isConnected(), detail: this.isConnected() ? 'live link' : 'no live link' });

        if (this.serviceUUID) {
            report.push({ step: 'Service UUID', ok: true, detail: this.serviceUUID });
        }
        if (this.characteristicUUID) {
            report.push({ step: 'Characteristic UUID', ok: true, detail: this.characteristicUUID });
        }

        if (this.isConnected()) {
            const test = await this.sendTestPrint();
            report.push({ step: 'Test Write', ok: test.ok, detail: test.ok ? `${test.ms}ms` : test.error });
        } else {
            report.push({ step: 'Test Write', ok: false, detail: 'skipped — not connected' });
        }
        if (this.lastError) {
            report.push({ step: 'Last Error', ok: false, detail: this.lastError });
        }
        return report;
    }

    // ============ Cache Clear Recovery ============

    /**
     * Restore localStorage printer settings from Supabase server data.
     * Called by BluetoothPrinterSettings when it detects server data exists
     * but localStorage is empty (e.g. after browser cache clear).
     * Returns true if settings were restored.
     */
    public restoreFromServer(serverData: {
        printer_name?: string | null;
        printer_type?: string | null;
        is_enabled?: boolean;
        auto_print?: boolean;
        station_printer_map?: Record<string, string> | null;
    }): boolean {
        const currentType = localStorage.getItem(PRINTER_TYPE_KEY);
        // Only restore if localStorage is empty (cache was cleared)
        if (currentType && currentType !== 'none') {
            return false; // localStorage already has settings, no need to restore
        }

        let restored = false;

        // Restore printer type
        if (serverData.printer_type && serverData.printer_type !== 'none') {
            localStorage.setItem(PRINTER_TYPE_KEY, serverData.printer_type);
            this._printerType = serverData.printer_type as PrinterType;
            restored = true;
        }

        // Restore printer name
        if (serverData.printer_name) {
            localStorage.setItem('hotel_pos_bluetooth_printer_name', serverData.printer_name);
            this.deviceName = serverData.printer_name;
            restored = true;
        }

        // Restore station printer map
        if (serverData.station_printer_map && Object.keys(serverData.station_printer_map).length > 0) {
            localStorage.setItem('hotel_pos_station_printer_map', JSON.stringify(serverData.station_printer_map));
            restored = true;
        }

        if (restored) {
            console.log('[Printer] Settings restored from server after cache clear');
            this.recordLog('reconnect', 'info', undefined, 'Settings restored from server backup');
            // Trigger auto-reconnect with restored settings
            setTimeout(() => {
                this.autoReconnect().catch(() => undefined);
            }, 500);
        }

        return restored;
    }

    /**
     * Sync current localStorage printer settings TO Supabase.
     * Called after any printer connection change so the server
     * always has a backup of the config.
     */
    public getSettingsForSync(): {
        printer_type: string;
        printer_name: string | null;
        station_printer_map: Record<string, string>;
    } {
        const stationMapRaw = localStorage.getItem('hotel_pos_station_printer_map');
        let stationMap: Record<string, string> = {};
        try {
            stationMap = stationMapRaw ? JSON.parse(stationMapRaw) : {};
        } catch { /* empty */ }

        return {
            printer_type: this._printerType,
            printer_name: this.deviceName || null,
            station_printer_map: stationMap,
        };
    }

    // ============ Platform Detection ============

    /**
     * Detect if running on iOS/iPadOS (Safari/Chrome on iOS).
     * Web Bluetooth is NOT supported on any iOS browser.
     */
    public static isIOSDevice(): boolean {
        if (typeof navigator === 'undefined') return false;
        const ua = navigator.userAgent || '';
        // Standard iOS detection
        if (/iPad|iPhone|iPod/.test(ua)) return true;
        // iPadOS 13+ reports as Mac with touch support
        if (/Macintosh/.test(ua) && 'ontouchend' in document) return true;
        return false;
    }
}

// Export singleton instance
export const printerManager = PrinterManager.getInstance();

// Export the class for type usage
export { PrinterManager };
