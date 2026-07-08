import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Printer, Bluetooth, AlertCircle, CheckCircle2, RefreshCw, FileText, Zap, Upload, Image as ImageIcon, X, WifiOff, Loader2, Usb } from 'lucide-react';
import { usePrinter } from '@/hooks/usePrinter';
import { getStationMap, assignStationPrinter, removeStationPrinter, DEFAULT_STATIONS } from '@/utils/stationPrinters';
import { printerManager } from '@/utils/printerManager';


// Local storage key for device persistence
const BLUETOOTH_DEVICE_KEY = 'hotel_pos_bluetooth_printer';

interface BluetoothSettings {
  id?: string;
  is_enabled: boolean;
  printer_name: string | null;
  auto_print: boolean;
}

interface SavedDevice {
  name: string;
  lastConnected: number;
}

import { useBranch } from '@/contexts/BranchContext';

export const BluetoothPrinterSettings: React.FC = () => {
  const { profile } = useAuth();
  const { operatingBranchId, branches } = useBranch();
  const mainBranchId = branches.find(b => b.is_main)?.id || null;

  // Use the new persistent printer hook
  const {
    connectionState,
    deviceName: connectedDeviceName,
    isConnected,
    isBluetoothSupported,
    isUSBSupported,
    printerType,
    queueSize,
    connect,
    connectUSB,
    disconnect,
    print
  } = usePrinter();

  const [settings, setSettings] = useState<BluetoothSettings>({
    is_enabled: false,
    printer_name: null,
    auto_print: false
  });
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [connectionQuality, setConnectionQuality] = useState<'good' | 'fair' | 'poor' | null>(null);

  // Sync connection state with local state
  useEffect(() => {
    if (isConnected && connectedDeviceName) {
      setSettings(prev => ({
        ...prev,
        is_enabled: true,
        printer_name: connectedDeviceName
      }));
    }
  }, [isConnected, connectedDeviceName]);

  const fetchSettings = async () => {
    try {
      let { data, error } = await supabase
        .from('bluetooth_settings')
        .select('*')
        .eq('user_id', profile?.user_id)
        .eq('branch_id', operatingBranchId)
        .maybeSingle();

      if (!data && mainBranchId && mainBranchId !== operatingBranchId) {
        const { data: mainRow } = await supabase
          .from('bluetooth_settings')
          .select('*')
          .eq('user_id', profile?.user_id)
          .eq('branch_id', mainBranchId)
          .maybeSingle();
        // Inherit values but DON'T inherit row id (so save creates a fresh per-branch row)
        if (mainRow) data = { ...mainRow, id: undefined } as any;
      }

      if (error) throw error;

      if (data) {
        setSettings({
          id: (data as any).id,
          is_enabled: data.is_enabled,
          printer_name: data.printer_name,
          auto_print: data.auto_print
        });
      }
    } catch (error) {
      console.error('Error fetching bluetooth settings:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (profile?.user_id && operatingBranchId) {
      fetchSettings();
    }
  }, [profile?.user_id, operatingBranchId]);








  const updateSettings = async (updates: Partial<BluetoothSettings>) => {
    try {
      const newSettings = { ...settings, ...updates };
      setSettings(newSettings);

      if (settings.id) {
        const { error } = await supabase
          .from('bluetooth_settings')
          .update({
            is_enabled: newSettings.is_enabled,
            printer_name: newSettings.printer_name,
            auto_print: newSettings.auto_print
          })
          .eq('id', settings.id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('bluetooth_settings')
          .insert({
            user_id: profile?.user_id,
            branch_id: operatingBranchId,
            is_enabled: newSettings.is_enabled,
            printer_name: newSettings.printer_name,
            auto_print: newSettings.auto_print
          })
          .select()
          .single();

        if (error) throw error;
        setSettings(prev => ({ ...prev, id: data.id }));
      }

      toast({
        title: "Success",
        description: "Settings updated successfully",
      });
    } catch (error) {
      console.error('Error updating settings:', error);
      toast({
        title: "Error",
        description: "Failed to update settings",
        variant: "destructive",
      });
    }
  };

  const connectPrinter = async () => {
    if (!isBluetoothSupported) {
      toast({
        title: "Not Supported",
        description: "Bluetooth is not supported in this browser. Use Chrome or Edge on Android/Desktop.",
        variant: "destructive",
      });
      return;
    }

    setConnecting(true);
    try {
      const success = await connect(true); // Force new device selection

      if (success) {
        await updateSettings({
          printer_name: connectedDeviceName || 'Bluetooth Printer',
          is_enabled: true
        });

        toast({
          title: "Connected!",
          description: `Successfully connected to ${connectedDeviceName || 'Bluetooth Printer'}. Connection will persist across prints.`,
        });
      }
    } catch (error: any) {
      if (error.name !== 'NotFoundError') {
        console.error('Bluetooth error:', error);
        toast({
          title: "Connection Failed",
          description: error.message || "Failed to connect to printer. Make sure the printer is on and paired.",
          variant: "destructive",
        });
      }
    } finally {
      setConnecting(false);
    }
  };

  const disconnectPrinter = () => {
    disconnect();
    updateSettings({ printer_name: null, is_enabled: false });
    toast({
      title: "Disconnected",
      description: "Printer has been disconnected. You'll need to pair again for printing.",
    });
  };

  const connectUSBPrinter = async () => {
    if (!isUSBSupported) {
      toast({
        title: "Not Supported",
        description: "USB printing is not supported in this browser. Use Chrome or Edge.",
        variant: "destructive",
      });
      return;
    }

    setConnecting(true);
    try {
      const success = await connectUSB(true);

      if (success) {
        await updateSettings({
          printer_name: connectedDeviceName || 'USB Printer',
          is_enabled: true
        });

        toast({
          title: "USB Printer Connected!",
          description: `Successfully connected to ${connectedDeviceName || 'USB Printer'}. Connection is persistent.`,
        });
      }
    } catch (error: any) {
      if (error.name !== 'NotFoundError') {
        console.error('USB Printer error:', error);
        toast({
          title: "Connection Failed",
          description: error.message || "Failed to connect to USB printer.",
          variant: "destructive",
        });
      }
    } finally {
      setConnecting(false);
    }
  };

  const printTestPage = async () => {
    if (!isConnected) {
      toast({
        title: "No Printer",
        description: "Please connect a printer first",
        variant: "destructive",
      });
      return;
    }

    setPrinting(true);
    try {
      // Use the PrinterManager to print test page
      const testData = {
        billNo: 'TEST',
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString(),
        items: [{ name: 'Test Item', quantity: 1, price: 100, total: 100 }],
        subtotal: 100,
        total: 100,
        paymentMethod: 'Cash',
        shopName: 'Test Print',
        printerWidth: '58mm' as const
      };

      const success = await print(testData);

      if (success) {
        toast({
          title: "Test Print Sent!",
          description: "Check your printer for the test page. Connection is persistent - no re-pairing needed!",
        });
      } else {
        throw new Error('Print failed');
      }
    } catch (error: any) {
      console.error('Print error:', error);
      toast({
        title: "Print Failed",
        description: error.message || "Failed to print test page. Try reconnecting the printer.",
        variant: "destructive",
      });
    } finally {
      setPrinting(false);
    }
  };

  // isBluetoothSupported is now provided by usePrinter hook

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <Card className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 border-none shadow-sm">
      <CardContent className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-full ${isConnected ? 'bg-green-100/50 text-green-600 dark:bg-green-900/30' : connectionState === 'connecting' ? 'bg-blue-100/50 text-blue-600 dark:bg-blue-900/30' : 'bg-slate-200/50 text-slate-500 dark:bg-slate-800'}`}>
            {connectionState === 'connecting' ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : isConnected ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : (
              <Printer className="w-5 h-5" />
            )}
          </div>
          <div>
            <h3 className="font-semibold text-sm">{printerType === 'usb' ? 'USB Printer' : 'Bluetooth Printer'}</h3>
            <p className="text-xs text-muted-foreground">
              {connectionState === 'connecting' ? (
                <span className="text-blue-600 flex items-center gap-1">● Connecting...</span>
              ) : isConnected ? (
                <span className="text-green-600 flex items-center gap-1">● Connected to {connectedDeviceName || settings.printer_name} ({printerType === 'usb' ? 'USB' : 'Bluetooth'} — Persistent)</span>
              ) : connectionState === 'error' ? (
                <span className="text-red-600 flex items-center gap-1">● Connection error</span>
              ) : (
                "Not connected"
              )}
            </p>
            {queueSize > 0 && (
              <p className="text-xs text-amber-600">📋 {queueSize} print job(s) queued</p>
            )}
          </div>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs font-medium rounded-full px-4 border-slate-300 dark:border-slate-700">
              {settings.is_enabled ? 'Settings' : 'Pair Device'}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md p-0 overflow-hidden sm:rounded-2xl gap-0 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800">
            <DialogHeader className="p-4 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800/50 sticky top-0 z-10">
              <DialogTitle className="text-base font-medium flex items-center gap-2">
                <Bluetooth className="w-5 h-5 text-blue-500" />
                Device Settings
              </DialogTitle>
            </DialogHeader>

            <div className="p-4 overflow-y-auto max-h-[80vh] space-y-6">
              {/* Connection Status Section */}
              <div className="bg-white dark:bg-slate-900 rounded-xl p-4 shadow-sm border border-slate-100 dark:border-slate-800">
                <h4 className="text-xs font-semibold uppercase text-slate-400 mb-3 tracking-wider">Connection Status</h4>
                {settings.printer_name ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-full">
                        <CheckCircle2 className="w-6 h-6 text-green-600" />
                      </div>
                      <div>
                        <div className="font-medium text-sm text-slate-900 dark:text-slate-100">{settings.printer_name}</div>
                        <div className="text-xs text-green-600 font-medium">Connected</div>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={disconnectPrinter} className="text-red-500 hover:text-red-600 hover:bg-red-50 h-8 px-3 text-xs">
                      Unpair
                    </Button>
                  </div>
                ) : (
                  <div className="text-center py-2">
                    {/* Premium animated header */}
                    <div className="relative mb-4">
                      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-blue-500/20 rounded-full blur-xl animate-pulse"></div>
                      <div className="relative w-20 h-20 mx-auto bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center shadow-lg shadow-blue-500/30">
                        <Bluetooth className="w-10 h-10 text-white animate-pulse" />
                      </div>
                    </div>

                    <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-1">Connect Your Printer</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Follow these steps to pair your Bluetooth printer</p>

                    {/* Steps guide */}
                    <div className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 rounded-xl p-4 mb-4 text-left">
                      <div className="space-y-3">
                        <div className="flex items-start gap-3">
                          <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">1</div>
                          <div>
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Turn on your printer</p>
                            <p className="text-xs text-slate-500">Ensure it's powered and ready</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <div className="w-6 h-6 rounded-full bg-purple-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">2</div>
                          <div>
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Enable Bluetooth on device</p>
                            <p className="text-xs text-slate-500">Open device settings if needed</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">3</div>
                          <div>
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Tap button below to search</p>
                            <p className="text-xs text-slate-500">Select your printer from the list</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <Button
                      onClick={connectPrinter}
                      disabled={connecting || !isBluetoothSupported}
                      className="w-full h-12 bg-gradient-to-r from-blue-600 via-purple-600 to-blue-600 hover:from-blue-700 hover:via-purple-700 hover:to-blue-700 text-white text-base font-semibold shadow-lg shadow-blue-500/30 rounded-xl transition-all duration-300"
                    >
                      {connecting ? (
                        <>
                          <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                          Searching for devices...
                        </>
                      ) : (
                        <>
                          <Bluetooth className="w-5 h-5 mr-2" />
                          Start Pairing
                        </>
                      )}
                    </Button>

                    {!isBluetoothSupported && (
                      <p className="text-xs text-red-500 mt-2">
                        Bluetooth not supported. Use Chrome or Edge browser.
                      </p>
                    )}

                    {/* USB / Wired Printer Option */}
                    <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                      <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                        <Usb className="w-4 h-4" />
                        USB / Wired Printer
                      </h4>
                      <p className="text-xs text-slate-500 mb-3">Connect a wired printer via USB cable. No Bluetooth required.</p>
                      <Button
                        onClick={connectUSBPrinter}
                        disabled={connecting || !isUSBSupported}
                        variant="outline"
                        className="w-full h-11 rounded-xl border-slate-300 dark:border-slate-700 font-medium"
                      >
                        {connecting ? (
                          <>
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            Searching...
                          </>
                        ) : (
                          <>
                            <Usb className="w-4 h-4 mr-2" />
                            Connect USB Printer
                          </>
                        )}
                      </Button>
                      {!isUSBSupported && (
                        <p className="text-xs text-red-500 mt-1">
                          WebUSB not supported. Use Chrome or Edge.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Printer Settings Section */}
              {settings.printer_name && (
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold uppercase text-slate-400 px-1 tracking-wider">Preferences</h4>
                  <div className="bg-white dark:bg-slate-900 rounded-xl overflow-hidden shadow-sm border border-slate-100 dark:border-slate-800">
                    <div className="p-3 border-b border-slate-50 dark:border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                          <Printer className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Enable Printing</p>
                          <p className="text-[10px] text-slate-500">Allow printing receipts</p>
                        </div>
                      </div>
                      <Switch
                        checked={settings.is_enabled}
                        onCheckedChange={(checked) => updateSettings({ is_enabled: checked })}
                      />
                    </div>

                    <div className="p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                          <Zap className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Auto Print</p>
                          <p className="text-[10px] text-slate-500">Print automatically after sale</p>
                        </div>
                      </div>
                      <Switch
                        checked={settings.auto_print}
                        onCheckedChange={(checked) => updateSettings({ auto_print: checked })}
                        disabled={!settings.is_enabled}
                      />
                    </div>
                  </div>

                  <Button
                    onClick={printTestPage}
                    disabled={printing || !settings.is_enabled}
                    variant="outline"
                    className="w-full h-11 rounded-xl border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-medium bg-white dark:bg-slate-900"
                  >
                    {printing ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Printing Test Page...
                      </>
                    ) : (
                      "Print Test Page"
                    )}
                  </Button>
                </div>
              )}

              {/* Station → Printer Routing */}
              <StationPrinterMap />
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

// -------- Station Printer Mapping Panel --------
const StationPrinterMap: React.FC = () => {
  const [map, setMap] = useState<Record<string, string>>(getStationMap());
  const [customStation, setCustomStation] = useState('');
  const [availableNames, setAvailableNames] = useState<string[]>([]);
  const [checking, setChecking] = useState(false);
  const stations = Array.from(new Set([...DEFAULT_STATIONS, ...Object.keys(map)]));

  const refreshAvailability = async () => {
    setChecking(true);
    try {
      setAvailableNames(await printerManager.getPermittedBluetoothDeviceNames());
    } finally {
      setChecking(false);
    }
  };

  const refresh = () => {
    setMap(getStationMap());
    refreshAvailability();
  };

  useEffect(() => {
    refreshAvailability();
  }, []);

  const unmappedDefaultStations = DEFAULT_STATIONS.filter(station => !map[station]);
  const unavailableMappedStations = stations.filter(station => map[station] && !availableNames.includes(map[station]));

  const assign = async (station: string) => {
    const nav = navigator as any;
    if (!nav.bluetooth) {
      toast({ title: 'Bluetooth not supported', variant: 'destructive' });
      return;
    }
    try {
      const device = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          '000018f0-0000-1000-8000-00805f9b34fb',
          '49535343-fe7d-4ae5-8fa9-9fafd205e455',
          '18f0',
          'e7810a71-73ae-499d-8c15-faa9aef0c3f2'
        ]
      });
      if (device?.name) {
        assignStationPrinter(station, device.name);
        refresh();
        toast({ title: 'Printer assigned', description: `${station} → ${device.name}` });
      }
    } catch (err: any) {
      if (err?.name !== 'NotFoundError') {
        toast({ title: 'Assignment failed', description: err.message, variant: 'destructive' });
      }
    }
  };

  const clear = (station: string) => {
    removeStationPrinter(station);
    refresh();
  };

  const addCustom = () => {
    const s = customStation.trim().toLowerCase();
    if (!s) return;
    assignStationPrinter(s, ''); // placeholder, user assigns next
    setCustomStation('');
    refresh();
  };

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold uppercase text-slate-400 px-1 tracking-wider">Print Station → Printer</h4>
      {(unmappedDefaultStations.length > 0 || unavailableMappedStations.length > 0) && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300 space-y-1">
          <div className="flex items-center gap-1.5 font-semibold">
            <AlertCircle className="w-3.5 h-3.5" /> Station printer warnings
          </div>
          {unmappedDefaultStations.length > 0 && (
            <p>Missing mapping: {unmappedDefaultStations.map(s => s[0].toUpperCase() + s.slice(1)).join(', ')}.</p>
          )}
          {unavailableMappedStations.length > 0 && (
            <p>Not available now: {unavailableMappedStations.map(s => `${s} → ${map[s]}`).join(', ')}. Pair again or turn on the printer.</p>
          )}
        </div>
      )}
      <div className="bg-white dark:bg-slate-900 rounded-xl overflow-hidden shadow-sm border border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
        {stations.map(station => (
          <div key={station} className="p-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium capitalize flex items-center gap-1.5">
                {station}
                {map[station] ? (
                  availableNames.includes(map[station]) ? (
                    <Badge className="text-[9px] px-1 py-0 bg-green-500/10 text-green-600 border border-green-500/20">available</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[9px] px-1 py-0 text-amber-600 border-amber-500/30">offline</Badge>
                  )
                ) : DEFAULT_STATIONS.includes(station) ? (
                  <Badge variant="outline" className="text-[9px] px-1 py-0 text-amber-600 border-amber-500/30">missing</Badge>
                ) : null}
              </p>
              <p className="text-[11px] text-slate-500 truncate">
                {map[station] ? map[station] : 'No printer assigned — falls back to active printer'}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => assign(station)}>
                {map[station] ? 'Change' : 'Assign'}
              </Button>
              {map[station] !== undefined && (
                <Button size="sm" variant="ghost" className="h-8 px-2 text-xs text-red-500" onClick={() => clear(station)}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={customStation}
          onChange={(e) => setCustomStation(e.target.value)}
          placeholder="Add custom station (e.g. tandoor)"
          className="h-9 text-sm"
        />
        <Button size="sm" onClick={addCustom} disabled={!customStation.trim()}>Add</Button>
      </div>
      <Button size="sm" variant="outline" onClick={refreshAvailability} disabled={checking} className="w-full h-8 text-xs">
        {checking ? <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
        Check printer availability
      </Button>
      <p className="text-[11px] text-slate-500 px-1">
        Assign each station to a specific Bluetooth printer. Categories tagged with that station will KOT-print to the mapped device.
      </p>
    </div>
  );
};

