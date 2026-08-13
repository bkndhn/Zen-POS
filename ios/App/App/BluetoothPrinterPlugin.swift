import Foundation
import Capacitor

/// Capacitor plugin that exposes BluetoothPrinterManager to the JS layer.
/// Mirrors the exact same interface as the Android BluetoothPrinterPlugin.java
/// so the TypeScript code in printerManager.ts works identically on both platforms.
@objc(BluetoothPrinterPlugin)
public class BluetoothPrinterPlugin: CAPPlugin, CAPBridgedPlugin {
    
    public let identifier = "BluetoothPrinterPlugin"
    public let jsName = "BluetoothPrinter"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getBluetoothState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "enableBluetooth", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPairedDevices", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "connectSavedPrinter", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getConnectionStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disconnect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "printRaw", returnType: CAPPluginReturnPromise),
    ]
    
    private let manager = BluetoothPrinterManager.shared
    
    // MARK: - getBluetoothState
    /// Returns { supported: bool, enabled: bool, permission: bool }
    @objc func getBluetoothState(_ call: CAPPluginCall) {
        let state = manager.getBluetoothState()
        call.resolve([
            "supported": state.supported,
            "enabled": state.enabled,
            "permission": state.permission
        ])
    }
    
    // MARK: - enableBluetooth
    /// iOS cannot programmatically enable Bluetooth.
    /// Returns current state — user must enable via Settings or Control Center.
    @objc func enableBluetooth(_ call: CAPPluginCall) {
        let state = manager.getBluetoothState()
        if state.enabled {
            call.resolve([
                "enabled": true,
                "prompted": false
            ])
        } else {
            // On iOS we can't show a system prompt to enable Bluetooth.
            // Return the current state so the app can show its own UI guidance.
            call.resolve([
                "enabled": false,
                "prompted": false
            ])
        }
    }
    
    // MARK: - getPairedDevices
    /// On iOS, there's no "paired devices" list for BLE.
    /// Instead, we scan for nearby BLE printers and return them.
    /// This mirrors the Android behavior of returning available printers.
    @objc func getPairedDevices(_ call: CAPPluginCall) {
        manager.scanForPrinters(timeout: 5.0) { devices in
            var devicesArray: [[String: String]] = []
            for device in devices {
                devicesArray.append([
                    "name": device["name"] ?? "Unknown Printer",
                    "address": device["address"] ?? ""
                ])
            }
            call.resolve([
                "devices": devicesArray
            ])
        }
    }
    
    // MARK: - connectSavedPrinter
    /// Connects to a saved printer by address, or scans and connects to first found.
    /// Returns { success: bool, name: string?, address: string?, serviceUuid: string? }
    @objc func connectSavedPrinter(_ call: CAPPluginCall) {
        let address = call.getString("address") ?? ""
        
        manager.connectToSavedPrinter(address: address.isEmpty ? nil : address) { success, name, address, errorOrServiceUuid in
            if success {
                call.resolve([
                    "success": true,
                    "name": name ?? "Bluetooth Printer",
                    "address": address ?? "",
                    "serviceUuid": errorOrServiceUuid ?? ""
                ])
            } else {
                call.reject(errorOrServiceUuid ?? "Connection failed")
            }
        }
    }
    
    // MARK: - getConnectionStatus
    /// Returns { connected: bool, name: string?, address: string? }
    @objc func getConnectionStatus(_ call: CAPPluginCall) {
        call.resolve([
            "connected": manager.isConnected,
            "name": manager.connectedDeviceName ?? "",
            "address": manager.connectedDeviceAddress ?? ""
        ])
    }
    
    // MARK: - disconnect
    @objc func disconnect(_ call: CAPPluginCall) {
        manager.disconnect()
        call.resolve()
    }
    
    // MARK: - printRaw
    /// Sends raw hex-encoded ESC/POS data to the connected printer.
    /// { hex: string, address?: string } → { success: bool }
    @objc func printRaw(_ call: CAPPluginCall) {
        guard let hexString = call.getString("hex") else {
            call.reject("Must provide hex data")
            return
        }
        
        let address = call.getString("address")
        
        manager.printRaw(hexString: hexString, address: address) { success, error in
            if success {
                call.resolve([
                    "success": true
                ])
            } else {
                call.reject(error ?? "Print failed")
            }
        }
    }
}
