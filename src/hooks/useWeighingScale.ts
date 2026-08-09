import { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from '@/hooks/use-toast';

const UART_SERVICE_UUIDS = [
  '0000ffe0-0000-1000-8000-00805f9b34fb', // HM-10 / generic serial
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART
  '49535343-fe7d-4ae5-8fa9-9fafd205e455'  // ISSC Transparent
];

export const useWeighingScale = () => {
  const [weight, setWeight] = useState<number>(0);
  const [isConnected, setIsConnected] = useState(false);
  const [isSupported] = useState('serial' in navigator || 'bluetooth' in navigator);
  const [isBluetoothSupported] = useState('bluetooth' in navigator);
  const [isUsbSupported] = useState('serial' in navigator);
  
  // USB Refs
  const portRef = useRef<any>(null);
  const readerRef = useRef<any>(null);
  const keepReadingRef = useRef(false);

  // Bluetooth Refs
  const deviceRef = useRef<any>(null);

  const disconnect = useCallback(async () => {
    keepReadingRef.current = false;
    
    // Disconnect USB
    if (readerRef.current) {
      try { await readerRef.current.cancel(); } catch (e) { console.warn('Error cancelling reader:', e); }
    }
    if (portRef.current) {
      try { await portRef.current.close(); } catch (e) { console.warn('Error closing port:', e); }
    }
    portRef.current = null;
    readerRef.current = null;

    // Disconnect Bluetooth
    if (deviceRef.current && deviceRef.current.gatt && deviceRef.current.gatt.connected) {
      try { deviceRef.current.gatt.disconnect(); } catch(e) { console.warn('Error disconnecting BT:', e); }
    }
    deviceRef.current = null;

    setIsConnected(false);
    setWeight(0);
  }, []);

  const connectUSB = useCallback(async () => {
    if (!('serial' in navigator)) {
      toast({ title: 'Not Supported', description: 'Web Serial API is not supported in this browser (requires Chrome/Edge).', variant: 'destructive' });
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
        const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
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
      if (!err.message.includes('No port selected')) {
         toast({ title: 'Connection Failed', description: err.message, variant: 'destructive' });
      }
      setIsConnected(false);
    }
  }, []);

  const connectBluetooth = useCallback(async () => {
    if (!('bluetooth' in navigator)) {
      toast({ title: 'Not Supported', description: 'Web Bluetooth API is not supported in this browser.', variant: 'destructive' });
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

      if (!uartService) throw new Error("Device does not expose standard Bluetooth UART services.");

      const characteristics = await uartService.getCharacteristics();
      let rxCharacteristic = null;
      for (const char of characteristics) {
        if (char.properties.notify || char.properties.indicate) {
          rxCharacteristic = char;
          break;
        }
      }

      if (!rxCharacteristic) throw new Error("Could not find a readable data stream on this Bluetooth device.");

      await rxCharacteristic.startNotifications();
      setIsConnected(true);
      toast({ title: 'Scale Connected', description: 'Listening for live weight data via Bluetooth.' });

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
      if (!err.message.includes('User cancelled') && !err.message.includes('cancelled')) {
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

  return { weight, isConnected, isSupported, isBluetoothSupported, isUsbSupported, connectUSB, connectBluetooth, disconnect };
};
