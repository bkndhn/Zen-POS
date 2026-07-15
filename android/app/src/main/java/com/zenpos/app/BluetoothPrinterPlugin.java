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
    private static final String TAG = "BluetoothPrinter";

    @PluginMethod
    public void printRaw(PluginCall call) {
        String hexString = call.getString("hex");
        String targetName = call.getString("name"); // optional name to match

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
                if (socket == null || !socket.isConnected()) {
                    BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
                    if (adapter == null) {
                        call.reject("Bluetooth not supported on this device");
                        return;
                    }

                    if (!adapter.isEnabled()) {
                        call.reject("Bluetooth is disabled");
                        return;
                    }

                    Set<BluetoothDevice> pairedDevices = adapter.getBondedDevices();
                    if (pairedDevices == null || pairedDevices.size() == 0) {
                        call.reject("No paired Bluetooth devices found");
                        return;
                    }

                    BluetoothDevice targetDevice = null;
                    if (targetName != null && !targetName.isEmpty()) {
                        for (BluetoothDevice device : pairedDevices) {
                            if (targetName.equals(device.getName())) {
                                targetDevice = device;
                                break;
                            }
                        }
                    }

                    if (targetDevice == null) {
                        // Fallback to first bonded device (usually the thermal printer)
                        targetDevice = pairedDevices.iterator().next();
                    }

                    UUID sppUuid = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
                    socket = targetDevice.createRfcommSocketToServiceRecord(sppUuid);
                    socket.connect();
                }

                // Convert hex to bytes
                byte[] bytes = new byte[hexString.length() / 2];
                for (int i = 0; i < bytes.length; i++) {
                    bytes[i] = (byte) Integer.parseInt(hexString.substring(2 * i, 2 * i + 2), 16);
                }

                OutputStream os = socket.getOutputStream();
                os.write(bytes);
                os.flush();

                JSObject ret = new JSObject();
                ret.put("success", true);
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "Print error: " + e.getMessage());
                // Reset socket on error so next print tries to reconnect
                if (socket != null) {
                    try { socket.close(); } catch (Exception ignored) {}
                    socket = null;
                }
                call.reject("Print failed: " + e.getMessage());
            }
        }).start();
    }
}
