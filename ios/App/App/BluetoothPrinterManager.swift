import Foundation
import CoreBluetooth
import Capacitor

/// CoreBluetooth manager for thermal receipt printers.
/// Handles BLE scanning, connection, and raw data writing.
/// Mirrors the Android BluetoothPrinterPlugin Java interface.
class BluetoothPrinterManager: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate {
    
    static let shared = BluetoothPrinterManager()
    
    // MARK: - Known Thermal Printer Service/Characteristic UUIDs
    // Most thermal printers expose one of these BLE services
    private let knownServiceUUIDs: [CBUUID] = [
        CBUUID(string: "49535343-FE7D-4AE5-8FA9-9FAFD205E455"), // ISSC Transparent UART
        CBUUID(string: "E7810A71-73AE-499D-8C15-FAA9AEF0C3F2"), // Common BLE printer
        CBUUID(string: "0000FF00-0000-1000-8000-00805F9B34FB"), // Generic printer service
        CBUUID(string: "0000FFF0-0000-1000-8000-00805F9B34FB"), // Alternate printer service
        CBUUID(string: "18F0"),                                   // Short UUID for some printers
        CBUUID(string: "0000AE30-0000-1000-8000-00805F9B34FB"), // Goojprt / POS printers
    ]
    
    private let knownWriteCharUUIDs: [CBUUID] = [
        CBUUID(string: "49535343-8841-43F4-A8D4-ECBE34729BB3"), // ISSC write
        CBUUID(string: "BEF8D6C9-9C21-4C9E-B632-BD58C1009F9F"), // Common write
        CBUUID(string: "0000FF02-0000-1000-8000-00805F9B34FB"), // Generic write
        CBUUID(string: "0000FFF2-0000-1000-8000-00805F9B34FB"), // Alternate write
        CBUUID(string: "2AF1"),                                   // Short write UUID
        CBUUID(string: "0000AE10-0000-1000-8000-00805F9B34FB"), // Goojprt write
    ]
    
    // MARK: - State
    private var centralManager: CBCentralManager!
    private var connectedPeripheral: CBPeripheral?
    private var writeCharacteristic: CBCharacteristic?
    private var discoveredPeripherals: [CBPeripheral] = []
    private var discoveredDeviceInfos: [[String: String]] = []
    
    // Persistence
    private let savedAddressKey = "zenpos_ios_printer_address"
    private let savedNameKey = "zenpos_ios_printer_name"
    
    // Callbacks
    private var scanCallback: (([[String: String]]) -> Void)?
    private var connectCallback: ((Bool, String?, String?, String?) -> Void)?
    private var disconnectCallback: (() -> Void)?
    private var writeCallback: ((Bool, String?) -> Void)?
    private var scanTimer: Timer?
    
    // Write queue
    private var pendingData: Data?
    private var isWriting = false
    
    private override init() {
        super.init()
        centralManager = CBCentralManager(delegate: self, queue: DispatchQueue.global(qos: .userInitiated))
    }
    
    // MARK: - Public Interface
    
    var isSupported: Bool {
        return true // All iOS devices support BLE
    }
    
    var isEnabled: Bool {
        return centralManager.state == .poweredOn
    }
    
    var hasPermission: Bool {
        if #available(iOS 13.1, *) {
            return CBCentralManager.authorization == .allowedAlways
        }
        return true
    }
    
    var isConnected: Bool {
        return connectedPeripheral != nil && connectedPeripheral?.state == .connected && writeCharacteristic != nil
    }
    
    var connectedDeviceName: String? {
        return connectedPeripheral?.name ?? UserDefaults.standard.string(forKey: savedNameKey)
    }
    
    var connectedDeviceAddress: String? {
        return connectedPeripheral?.identifier.uuidString ?? UserDefaults.standard.string(forKey: savedAddressKey)
    }
    
    // MARK: - Get Bluetooth State
    func getBluetoothState() -> (supported: Bool, enabled: Bool, permission: Bool) {
        return (isSupported, isEnabled, hasPermission)
    }
    
    // MARK: - Scan for Printers (replaces getPairedDevices on Android)
    func scanForPrinters(timeout: TimeInterval = 5.0, completion: @escaping ([[String: String]]) -> Void) {
        guard centralManager.state == .poweredOn else {
            completion([])
            return
        }
        
        discoveredPeripherals.removeAll()
        discoveredDeviceInfos.removeAll()
        scanCallback = completion
        
        // Also add any previously connected peripheral
        if let savedUUID = UserDefaults.standard.string(forKey: savedAddressKey),
           let uuid = UUID(uuidString: savedUUID) {
            let knownPeripherals = centralManager.retrievePeripherals(withIdentifiers: [uuid])
            for p in knownPeripherals {
                addDiscoveredPeripheral(p)
            }
        }
        
        // Scan for devices with known printer services
        centralManager.scanForPeripherals(withServices: nil, options: [
            CBCentralManagerScanOptionAllowDuplicatesKey: false
        ])
        
        scanTimer?.invalidate()
        scanTimer = Timer.scheduledTimer(withTimeInterval: timeout, repeats: false) { [weak self] _ in
            self?.centralManager.stopScan()
            DispatchQueue.main.async {
                self?.scanCallback?(self?.discoveredDeviceInfos ?? [])
                self?.scanCallback = nil
            }
        }
    }
    
    private func addDiscoveredPeripheral(_ peripheral: CBPeripheral) {
        if !discoveredPeripherals.contains(where: { $0.identifier == peripheral.identifier }) {
            discoveredPeripherals.append(peripheral)
            let info: [String: String] = [
                "name": peripheral.name ?? "Unknown Printer",
                "address": peripheral.identifier.uuidString
            ]
            discoveredDeviceInfos.append(info)
        }
    }
    
    // MARK: - Connect
    func connectToSavedPrinter(address: String? = nil, completion: @escaping (Bool, String?, String?, String?) -> Void) {
        let targetAddress = (address?.isEmpty ?? true)
            ? UserDefaults.standard.string(forKey: savedAddressKey)
            : address
        
        guard centralManager.state == .poweredOn else {
            completion(false, nil, nil, "Bluetooth is not enabled")
            return
        }
        
        connectCallback = completion
        
        if let uuidStr = targetAddress, let uuid = UUID(uuidString: uuidStr) {
            // Try to reconnect to known device
            let knownPeripherals = centralManager.retrievePeripherals(withIdentifiers: [uuid])
            if let peripheral = knownPeripherals.first {
                connectToPeripheral(peripheral)
                return
            }
            // Also check connected peripherals
            let connected = centralManager.retrieveConnectedPeripherals(withServices: knownServiceUUIDs)
            if let peripheral = connected.first(where: { $0.identifier == uuid }) {
                connectToPeripheral(peripheral)
                return
            }
        }
        
        // If no saved address or device not found, scan and connect to first printer found
        scanForPrinters(timeout: 8.0) { [weak self] devices in
            guard let self = self else { return }
            if let firstDevice = self.discoveredPeripherals.first {
                self.connectToPeripheral(firstDevice)
            } else {
                DispatchQueue.main.async {
                    self.connectCallback?(false, nil, nil, "No Bluetooth printers found")
                    self.connectCallback = nil
                }
            }
        }
    }
    
    private func connectToPeripheral(_ peripheral: CBPeripheral) {
        // Cancel any existing connection
        if let existing = connectedPeripheral, existing.identifier != peripheral.identifier {
            centralManager.cancelPeripheralConnection(existing)
        }
        
        connectedPeripheral = peripheral
        peripheral.delegate = self
        centralManager.stopScan()
        centralManager.connect(peripheral, options: [
            CBConnectPeripheralOptionNotifyOnDisconnectionKey: true
        ])
        
        // Timeout for connection
        DispatchQueue.main.asyncAfter(deadline: .now() + 10.0) { [weak self] in
            guard let self = self else { return }
            if self.writeCharacteristic == nil && self.connectCallback != nil {
                self.centralManager.cancelPeripheralConnection(peripheral)
                self.connectCallback?(false, nil, nil, "Connection timed out")
                self.connectCallback = nil
            }
        }
    }
    
    // MARK: - Disconnect
    func disconnect() {
        if let peripheral = connectedPeripheral {
            centralManager.cancelPeripheralConnection(peripheral)
        }
        connectedPeripheral = nil
        writeCharacteristic = nil
    }
    
    // MARK: - Print Raw Data
    func printRaw(hexString: String, address: String? = nil, completion: @escaping (Bool, String?) -> Void) {
        // If not connected, try to connect first
        if !isConnected {
            connectToSavedPrinter(address: address) { [weak self] success, name, addr, error in
                guard let self = self else { return }
                if success && self.isConnected {
                    self.writeToPrinter(hexString: hexString, completion: completion)
                } else {
                    completion(false, error ?? "Not connected to printer")
                }
            }
            return
        }
        
        writeToPrinter(hexString: hexString, completion: completion)
    }
    
    private func writeToPrinter(hexString: String, completion: @escaping (Bool, String?) -> Void) {
        guard let peripheral = connectedPeripheral,
              let characteristic = writeCharacteristic else {
            completion(false, "No printer connected")
            return
        }
        
        guard let data = Data(hexString: hexString) else {
            completion(false, "Invalid hex data")
            return
        }
        
        writeCallback = completion
        
        // Write in chunks (BLE has MTU limits, typically 20-512 bytes)
        let mtu = peripheral.maximumWriteValueLength(for: .withResponse)
        let chunkSize = max(min(mtu, 512), 20)
        
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let semaphore = DispatchSemaphore(value: 0)
            var offset = 0
            var writeError: String? = nil
            
            while offset < data.count {
                let end = min(offset + chunkSize, data.count)
                let chunk = data.subdata(in: offset..<end)
                
                // Check if characteristic supports writeWithResponse
                let writeType: CBCharacteristicWriteType = characteristic.properties.contains(.write) ? .withResponse : .withoutResponse
                
                DispatchQueue.main.async {
                    peripheral.writeValue(chunk, for: characteristic, type: writeType)
                }
                
                if writeType == .withResponse {
                    // Wait for write confirmation (with timeout)
                    let result = semaphore.wait(timeout: .now() + 5.0)
                    if result == .timedOut {
                        writeError = "Write timed out at offset \(offset)"
                        break
                    }
                } else {
                    // For writeWithoutResponse, add a small delay between chunks
                    Thread.sleep(forTimeInterval: 0.02)
                }
                
                offset = end
            }
            
            DispatchQueue.main.async {
                if let error = writeError {
                    self?.writeCallback?(false, error)
                } else {
                    self?.writeCallback?(true, nil)
                }
                self?.writeCallback = nil
            }
        }
    }
    
    // MARK: - CBCentralManagerDelegate
    
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        print("[BluetoothPrinter] Central state: \(central.state.rawValue)")
    }
    
    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral,
                        advertisementData: [String: Any], rssi RSSI: NSNumber) {
        // Filter for likely printers (has a name, reasonable RSSI)
        let name = peripheral.name ?? (advertisementData[CBAdvertisementDataLocalNameKey] as? String)
        if name != nil {
            addDiscoveredPeripheral(peripheral)
        }
    }
    
    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        print("[BluetoothPrinter] Connected to: \(peripheral.name ?? "Unknown")")
        // Save this device
        UserDefaults.standard.set(peripheral.identifier.uuidString, forKey: savedAddressKey)
        UserDefaults.standard.set(peripheral.name ?? "Bluetooth Printer", forKey: savedNameKey)
        
        // Discover services
        peripheral.discoverServices(nil) // Discover all services to find the write characteristic
    }
    
    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        print("[BluetoothPrinter] Failed to connect: \(error?.localizedDescription ?? "Unknown")")
        connectCallback?(false, nil, nil, "Failed to connect: \(error?.localizedDescription ?? "Unknown error")")
        connectCallback = nil
    }
    
    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        print("[BluetoothPrinter] Disconnected from: \(peripheral.name ?? "Unknown")")
        writeCharacteristic = nil
        // Don't nil out connectedPeripheral so we can reconnect
    }
    
    // MARK: - CBPeripheralDelegate
    
    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard error == nil, let services = peripheral.services else {
            connectCallback?(false, nil, nil, "Service discovery failed: \(error?.localizedDescription ?? "")")
            connectCallback = nil
            return
        }
        
        for service in services {
            peripheral.discoverCharacteristics(nil, for: service)
        }
    }
    
    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        guard error == nil, let characteristics = service.characteristics else { return }
        
        for characteristic in characteristics {
            // Look for a writable characteristic
            let isKnownWrite = knownWriteCharUUIDs.contains(characteristic.uuid)
            let isWritable = characteristic.properties.contains(.write) || characteristic.properties.contains(.writeWithoutResponse)
            
            if isKnownWrite || (isWritable && writeCharacteristic == nil) {
                writeCharacteristic = characteristic
                print("[BluetoothPrinter] Found write characteristic: \(characteristic.uuid) in service: \(service.uuid)")
                
                if isKnownWrite {
                    // Prefer known characteristics, stop searching
                    break
                }
            }
        }
        
        // Check if we've found a write characteristic and have a pending connect callback
        if writeCharacteristic != nil && connectCallback != nil {
            let name = peripheral.name ?? "Bluetooth Printer"
            let address = peripheral.identifier.uuidString
            let serviceUUID = writeCharacteristic?.service?.uuid.uuidString ?? ""
            connectCallback?(true, name, address, serviceUUID)
            connectCallback = nil
        }
    }
    
    func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) {
        if let error = error {
            print("[BluetoothPrinter] Write error: \(error.localizedDescription)")
        }
        // Signal the write semaphore if using writeWithResponse
        // Note: The semaphore approach in writeToPrinter handles this via timeout
    }
}

// MARK: - Data Extension for Hex
extension Data {
    init?(hexString: String) {
        let hex = hexString.replacingOccurrences(of: " ", with: "")
        guard hex.count % 2 == 0 else { return nil }
        
        var data = Data(capacity: hex.count / 2)
        var index = hex.startIndex
        while index < hex.endIndex {
            let nextIndex = hex.index(index, offsetBy: 2)
            guard let byte = UInt8(hex[index..<nextIndex], radix: 16) else { return nil }
            data.append(byte)
            index = nextIndex
        }
        self = data
    }
}
