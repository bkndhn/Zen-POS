package com.zenpos.app;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.JSArray;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;
import java.util.Set;
import java.util.UUID;

@CapacitorPlugin(name = "BluetoothPrinter")
public class BluetoothPrinterPlugin extends Plugin {
    private BluetoothSocket socket;
    private BluetoothDevice connectedDevice;
    private static final String TAG = "BluetoothPrinter";
    private static final String PREFS = "zenpos_printer";
    private static final String SAVED_ADDRESS = "saved_address";
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private final Object connectionLock = new Object();

    private boolean hasBluetoothPermission() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
            ContextCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
    }

    private String getSavedAddress() {
        return getContext().getSharedPreferences(PREFS, 0).getString(SAVED_ADDRESS, "");
    }

    private void saveAddress(String address) {
        getContext().getSharedPreferences(PREFS, 0).edit().putString(SAVED_ADDRESS, address).apply();
    }

    private void closeSocket() {
        if (socket != null) {
            try { socket.close(); } catch (Exception ignored) {}
        }
        socket = null;
        connectedDevice = null;
    }

    private BluetoothDevice findBondedDevice(String requestedAddress) throws Exception {
        if (!hasBluetoothPermission()) throw new SecurityException("BLUETOOTH_CONNECT permission is required");
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null) throw new Exception("Bluetooth not supported on this device");
        if (!adapter.isEnabled()) throw new Exception("Bluetooth is disabled");

        Set<BluetoothDevice> pairedDevices = adapter.getBondedDevices();
        if (pairedDevices == null || pairedDevices.isEmpty()) throw new Exception("No paired Bluetooth printers found");

        String address = requestedAddress == null || requestedAddress.isEmpty() ? getSavedAddress() : requestedAddress;
        if (!address.isEmpty()) {
            for (BluetoothDevice device : pairedDevices) {
                if (address.equalsIgnoreCase(device.getAddress())) return device;
            }
            throw new Exception("Saved printer is not paired with Android");
        }
        if (pairedDevices.size() == 1) return pairedDevices.iterator().next();
        throw new Exception("Choose a printer in Printer Settings first");
    }

    private void ensureConnected(String requestedAddress) throws Exception {
        synchronized (connectionLock) {
            if (socket != null && socket.isConnected()) return;
            closeSocket();
            BluetoothDevice target = findBondedDevice(requestedAddress);
            BluetoothAdapter.getDefaultAdapter().cancelDiscovery();
            BluetoothSocket nextSocket = target.createRfcommSocketToServiceRecord(SPP_UUID);
            nextSocket.connect();
            socket = nextSocket;
            connectedDevice = target;
            saveAddress(target.getAddress());
            Log.i(TAG, "Connected to " + target.getName() + " using SPP " + SPP_UUID);
        }
    }

    @PluginMethod
    public void connectSavedPrinter(PluginCall call) {
        final String address = call.getString("address", "");
        new Thread(() -> {
            try {
                ensureConnected(address);
                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("name", connectedDevice != null ? connectedDevice.getName() : "Bluetooth Printer");
                ret.put("address", connectedDevice != null ? connectedDevice.getAddress() : getSavedAddress());
                ret.put("serviceUuid", SPP_UUID.toString());
                call.resolve(ret);
            } catch (Exception e) {
                closeSocket();
                Log.e(TAG, "Connect error", e);
                call.reject("Printer not connected: " + e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void getConnectionStatus(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("connected", socket != null && socket.isConnected());
        ret.put("name", connectedDevice != null ? connectedDevice.getName() : "");
        ret.put("address", connectedDevice != null ? connectedDevice.getAddress() : getSavedAddress());
        call.resolve(ret);
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        synchronized (connectionLock) { closeSocket(); }
        call.resolve();
    }

    @PluginMethod
    public void printRaw(PluginCall call) {
        String hexString = call.getString("hex");
        String targetAddress = call.getString("address", ""); // MAC address to match

        if (hexString == null) {
            call.reject("Must provide hex data");
            return;
        }
        
        // Android 12+ requires BLUETOOTH_CONNECT permission at runtime
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                call.reject("BLUETOOTH_CONNECT permission is required.");
                return;
            }
        }

        new Thread(() -> {
            try {
                ensureConnected(targetAddress);

                // Convert hex to bytes
                byte[] bytes = new byte[hexString.length() / 2];
                for (int i = 0; i < bytes.length; i++) {
                    bytes[i] = (byte) Integer.parseInt(hexString.substring(2 * i, 2 * i + 2), 16);
                }

                try {
                    OutputStream os = socket.getOutputStream();
                    os.write(bytes);
                    os.flush();
                } catch (Exception firstWriteError) {
                    // A socket may still report connected after Android resumes. Reopen it once
                    // and retry the same receipt before returning a failure to the POS queue.
                    Log.w(TAG, "First write failed; reconnecting once", firstWriteError);
                    closeSocket();
                    ensureConnected(targetAddress);
                    OutputStream retryStream = socket.getOutputStream();
                    retryStream.write(bytes);
                    retryStream.flush();
                }

                JSObject ret = new JSObject();
                ret.put("success", true);
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "Print error: " + e.getMessage());
                // Reset socket on error so next print tries to reconnect
                closeSocket();
                call.reject("Printer not connected or write failed: " + e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void getPairedDevices(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                call.reject("BLUETOOTH_CONNECT permission is required.");
                return;
            }
        }

        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null || !adapter.isEnabled()) {
            call.reject("Bluetooth is not available or disabled.");
            return;
        }

        Set<BluetoothDevice> pairedDevices = adapter.getBondedDevices();
        JSArray devicesArray = new JSArray();

        if (pairedDevices != null) {
            for (BluetoothDevice device : pairedDevices) {
                JSObject devObj = new JSObject();
                devObj.put("name", device.getName() != null ? device.getName() : "Unknown Device");
                devObj.put("address", device.getAddress());
                devicesArray.put(devObj);
            }
        }

        JSObject ret = new JSObject();
        ret.put("devices", devicesArray);
        call.resolve(ret);
    }
}
