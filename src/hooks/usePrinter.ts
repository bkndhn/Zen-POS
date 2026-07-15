/**
 * usePrinter - React hook for printer connection (Bluetooth + USB)
 * 
 * Provides:
 * - Connection state (connected/disconnected/connecting/error)
 * - Device name when connected
 * - Printer type (bluetooth/usb/none)
 * - Connect/disconnect functions for both Bluetooth and USB
 * - Print function (routes to active transport)
 */

import { useState, useEffect, useCallback } from 'react';
import { printerManager, AutoReconnectState, PrinterConnectionState, PrinterType, ReconnectStatus } from '@/utils/printerManager';
import { PrintData } from '@/utils/bluetoothPrinter';

interface UsePrinterResult {
    // Connection state
    connectionState: PrinterConnectionState;
    deviceName: string;
    isConnected: boolean;
    isBluetoothSupported: boolean;
    isUSBSupported: boolean;
    printerType: PrinterType;
    autoReconnectState: AutoReconnectState;
    autoReconnectEnabled: boolean;
    reconnectStatus: ReconnectStatus;
    isTrusted: boolean;
    hasNativeBridge: boolean;

    // Queue info
    queueSize: number;

    // Actions
    connect: (forceNewDevice?: boolean) => Promise<boolean>;
    connectUSB: (forceNewDevice?: boolean) => Promise<boolean>;
    trustPrinter: () => Promise<boolean>;
    disconnect: () => void;
    print: (data: PrintData) => Promise<boolean>;
    clearQueue: () => void;
}

export const usePrinter = (): UsePrinterResult => {
    const [connectionState, setConnectionState] = useState<PrinterConnectionState>('disconnected');
    const [deviceName, setDeviceName] = useState<string>('');
    const [queueSize, setQueueSize] = useState<number>(0);
    const [printerType, setPrinterType] = useState<PrinterType>(printerManager.printerType);
    const [autoReconnectState, setAutoReconnectState] = useState<AutoReconnectState>(printerManager.getAutoReconnectState());
    const [autoReconnectEnabled, setAutoReconnectEnabled] = useState(printerManager.isAutoReconnectEnabled());
    const [reconnectStatus, setReconnectStatus] = useState(printerManager.getReconnectStatus());
    const [isTrusted, setIsTrusted] = useState(printerManager.isPrinterTrusted());

    // Subscribe to printer manager state changes
    useEffect(() => {
        const unsubscribe = printerManager.subscribe((state, name, reconnectState) => {
            setConnectionState(state);
            setDeviceName(name || '');
            setQueueSize(printerManager.getQueueSize());
            setPrinterType(printerManager.printerType);
            setAutoReconnectState(reconnectState || printerManager.getAutoReconnectState());
            setAutoReconnectEnabled(printerManager.isAutoReconnectEnabled());
            setReconnectStatus(printerManager.getReconnectStatus());
            setIsTrusted(printerManager.isPrinterTrusted());
        });

        // Check initial state
        setConnectionState(printerManager.getState());
        setDeviceName(printerManager.getDeviceName());
        setQueueSize(printerManager.getQueueSize());
        setPrinterType(printerManager.printerType);
        setAutoReconnectState(printerManager.getAutoReconnectState());
        setAutoReconnectEnabled(printerManager.isAutoReconnectEnabled());
        setReconnectStatus(printerManager.getReconnectStatus());
        setIsTrusted(printerManager.isPrinterTrusted());

        return unsubscribe;
    }, []);

    // Connect to Bluetooth printer
    const connect = useCallback(async (forceNewDevice: boolean = false): Promise<boolean> => {
        return printerManager.connect(forceNewDevice);
    }, []);

    // Connect to USB printer
    const connectUSB = useCallback(async (forceNewDevice: boolean = false): Promise<boolean> => {
        return printerManager.connectUSB(forceNewDevice);
    }, []);
    const trustPrinter = useCallback(() => printerManager.trustPrinter(), []);

    // Disconnect from printer
    const disconnect = useCallback((): void => {
        printerManager.disconnect();
    }, []);

    // Print receipt
    const print = useCallback(async (data: PrintData): Promise<boolean> => {
        const result = await printerManager.print(data);
        setQueueSize(printerManager.getQueueSize());
        return result;
    }, []);

    // Clear print queue
    const clearQueue = useCallback((): void => {
        printerManager.clearQueue();
        setQueueSize(0);
    }, []);

    return {
        connectionState,
        deviceName,
        isConnected: connectionState === 'connected',
        isBluetoothSupported: printerManager.isBluetoothSupported(),
        isUSBSupported: printerManager.isUSBSupported(),
        printerType,
        autoReconnectState,
        autoReconnectEnabled,
        reconnectStatus,
        isTrusted,
        hasNativeBridge: printerManager.hasNativePrinterBridge(),
        queueSize,
        connect,
        connectUSB,
        trustPrinter,
        disconnect,
        print,
        clearQueue
    };
};

export default usePrinter;
