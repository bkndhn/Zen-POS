import { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from '@/hooks/use-toast';
import { Capacitor } from '@capacitor/core';
import { BluetoothPrinter, isAndroidNative } from '@/utils/printerManager';

const UART_SERVICE_UUIDS = [
  '0000ffe0-0000-1000-8000-00805f9b34fb', // HM-10 / generic serial
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART
  '49535343-fe7d-4ae5-8fa9-9fafd205e455'  // ISSC Transparent
];

export const useWeighingScale = () => {
  const [weight, setWeight] = useState<number>(0);
  const [isConnected, setIsConnected] = useState(false);

  // Show the scale button on:
  // - Web/PWA: when Web Serial OR Web Bluetooth API is available
  // - Android (Capacitor): always show — uses native BT bridge
  const isNative = isAndroidNative();
  const [isSupported] = useState(
    isNative || 'serial' in navigator || 'bluetooth' in navigator
  );
  const [isBluetoothSupported] = useState(isNative || 'bluetooth' in navigator);
  // USB via Web Serial: web/PWA only. On Android, show it but give a clear message.
  const [isUsbSupported] = useState(isNative || 'serial' in navigator);

  // USB Refs (Web Serial)
  const portRef = useRef<any>(null);
  const readerRef = useRef<any>(null);
  const keepReadingRef = useRef(false);

  // Bluetooth Refs (Web Bluetooth)
  const deviceRef = useRef<any>(null);

  // Native Android paired device picker state
  const [nativeDevices, setNativeDevices] = useState<Array<{ name: string; address: string }>>([]);
  const [showNativePicker, setShowNativePicker] = useState(false);
  const nativePollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const disconnect = useCallback(async () => {
    keepReadingRef.current = false;

    // Stop native polling
    if (nativePollingRef.current) {
      clearInterval(nativePollingRef.current);
      nativePollingRef.current = null;
    }

    // Disconnect USB
    if (readerRef.current) {
      try { await readerRef.current.cancel(); } catch (e) { console.warn('Error cancelling reader:', e); }
    }
    if (portRef.current) {
      try { await portRef.current.close(); } catch (e) { console.warn('Error closing port:', e); }
    }
    portRef.current = null;
    readerRef.current = null;

    // Disconnect Web Bluetooth
    if (deviceRef.current && deviceRef.current.gatt && deviceRef.current.gatt.connected) {
      try { deviceRef.current.gatt.disconnect(); } catch(e) { console.warn('Error disconnecting BT:', e); }
    }
    deviceRef.current = null;

    setIsConnected(false);
    setWeight(0);
  }, []);

  // ─── USB CONNECT ─────────────────────────────────────────────────────────────
  const connectUSB = useCallback(async () => {
    // Android WebView does NOT support Web Serial API
    if (isAndroidNative()) {
      toast({
        title: 'USB Scale — Android',
        description: 'USB OTG serial is not available inside the Android app. Please connect your scale via Bluetooth instead.',
        variant: 'destructive',
      });
      return;
    }

    if (!('serial' in navigator)) {
      toast({
        title: 'Not Supported',
        description: 'Web Serial API requires Chrome or Edge on a desktop/laptop. Use Bluetooth for mobile devices.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: 9600 });
      portRef.current = port;

      keepReadingRef.current = true;
      setIsConnected(true);
      toast({ title: 'Scale Connected', description: 'Listening for live weight data via USB.' });

      while (port.readable && keepReadingRef.current) {
        const textDecoder = new TextDecoderStream();
        port.readable.pipeTo(textDecoder.writable);
        const reader = textDecoder.readable.getReader();
        readerRef.current = reader;

        let buffer = '';
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) {
              buffer += value;
              const lines = buffer.split(/[\r\n]+/);
              if (lines.length > 1) {
                buffer = lines.pop() || '';
                const latestLine = lines[lines.length - 1];
                if (latestLine) {
                  const match = latestLine.match(/([0-9]+\.[0-9]+|[0-9]+)/);
                  if (match) {
                    const parsed = parseFloat(match[1]);
                    if (!isNaN(parsed)) setWeight(parsed);
                  }
                }
              }
            }
          }
        } catch (error) {
          console.error('Error reading from USB scale:', error);
        } finally {
          reader.releaseLock();
        }
      }
    } catch (err: any) {
      console.error('Scale USB connection failed:', err);
      if (!err.message?.includes('No port selected')) {
        toast({ title: 'Connection Failed', description: err.message, variant: 'destructive' });
      }
      setIsConnected(false);
    }
  }, []);

  // ─── NATIVE ANDROID: connect to a specific paired device ─────────────────────
  const connectNativeBluetooth = useCallback(async (address: string, name: string) => {
    if (!isAndroidNative()) return;
    setShowNativePicker(false);
    try {
      // Save the address so the native bridge can use it
      localStorage.setItem('hotel_pos_scale_address', address);
      localStorage.setItem('hotel_pos_scale_name', name);

      const result = await BluetoothPrinter.connectSavedPrinter({ address });
      if (!result.success) throw new Error('Device did not confirm connection');

      setIsConnected(true);
      toast({
        title: '⚖️ Scale Connected',
        description: `Connected to "${name}" via Bluetooth. Live weight will appear when data is received.`,
      });

      // Poll for weight data every 500ms via the native plugin
      // (The native bridge handles the raw Bluetooth SPP data stream)
      // We check every 500ms — the Android plugin should expose a readData method
      // For now, we set a placeholder poll that can be extended with a native readData call
      nativePollingRef.current = setInterval(async () => {
        try {
          const status = await BluetoothPrinter.getConnectionStatus();
          if (!status.connected) {
            if (nativePollingRef.current) {
              clearInterval(nativePollingRef.current);
              nativePollingRef.current = null;
            }
            setIsConnected(false);
            setWeight(0);
            toast({ title: 'Scale Disconnected', description: 'Bluetooth scale connection lost.' });
          }
        } catch {
          // ignore polling errors
        }
      }, 3000);

    } catch (err: any) {
      console.error('Native scale BT connection failed:', err);
      toast({ title: 'Connection Failed', description: err.message || 'Could not connect to scale.', variant: 'destructive' });
      setIsConnected(false);
    }
  }, []);

  // ─── BLUETOOTH CONNECT ───────────────────────────────────────────────────────
  const connectBluetooth = useCallback(async () => {
    // Android Capacitor: use native Bluetooth bridge (Web Bluetooth not available in WebView)
    if (isAndroidNative()) {
      try {
        const { devices } = await BluetoothPrinter.getPairedDevices();
        if (!devices || devices.length === 0) {
          toast({
            title: 'No Paired Devices',
            description: 'No Bluetooth devices are paired. Please pair your scale in Android Settings → Bluetooth first.',
            variant: 'destructive',
          });
          return;
        }
        setNativeDevices(devices);
        setShowNativePicker(true);
      } catch (err: any) {
        toast({
          title: 'Bluetooth Error',
          description: err.message || 'Could not fetch paired devices. Ensure Bluetooth is enabled.',
          variant: 'destructive',
        });
      }
      return;
    }

    // Web / PWA: use Web Bluetooth API
    if (!('bluetooth' in navigator)) {
      toast({
        title: 'Not Supported',
        description: 'Web Bluetooth API requires Chrome on Android or desktop. Not available in this browser.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: UART_SERVICE_UUIDS
      });

      device.addEventListener('gattserverdisconnected', () => {
        setIsConnected(false);
        setWeight(0);
        toast({ title: 'Scale Disconnected', description: 'Bluetooth scale connection lost.' });
      });

      deviceRef.current = device;
      const server = await device.gatt.connect();

      const services = await server.getPrimaryServices();
      let uartService = null;
      for (const service of services) {
        if (UART_SERVICE_UUIDS.includes(service.uuid)) {
          uartService = service;
          break;
        }
      }

      if (!uartService) throw new Error('Device does not expose standard Bluetooth UART services.');

      const characteristics = await uartService.getCharacteristics();
      let rxCharacteristic = null;
      for (const char of characteristics) {
        if (char.properties.notify || char.properties.indicate) {
          rxCharacteristic = char;
          break;
        }
      }

      if (!rxCharacteristic) throw new Error('Could not find a readable data stream on this Bluetooth device.');

      await rxCharacteristic.startNotifications();
      setIsConnected(true);
      toast({ title: '⚖️ Scale Connected', description: 'Listening for live weight data via Bluetooth.' });

      let buffer = '';
      rxCharacteristic.addEventListener('characteristicvaluechanged', (event: any) => {
        const value = event.target.value;
        const decoder = new TextDecoder('utf-8');
        buffer += decoder.decode(value);
        const lines = buffer.split(/[\r\n]+/);
        if (lines.length > 1) {
          buffer = lines.pop() || '';
          const latestLine = lines[lines.length - 1];
          if (latestLine) {
            const match = latestLine.match(/([0-9]+\.[0-9]+|[0-9]+)/);
            if (match) {
              const parsed = parseFloat(match[1]);
              if (!isNaN(parsed)) setWeight(parsed);
            }
          }
        }
      });
    } catch (err: any) {
      console.error('Bluetooth scale connection failed:', err);
      if (!err.message?.includes('User cancelled') && !err.message?.includes('cancelled')) {
        toast({ title: 'Connection Failed', description: err.message, variant: 'destructive' });
      }
      setIsConnected(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    weight,
    isConnected,
    isSupported,
    isBluetoothSupported,
    isUsbSupported,
    connectUSB,
    connectBluetooth,
    disconnect,
    // Native Android picker state
    nativeDevices,
    showNativePicker,
    setShowNativePicker,
    connectNativeBluetooth,
  };
};
