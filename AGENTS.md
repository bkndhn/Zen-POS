# ZenPOS architecture

- Quick counter checkout reuses Billing payment calculations and the pending-bill outbox rather than a separate billing route, so tax, permissions and receipt settings stay consistent.
- Replay pending bills through secure_create_bill with their original bill numbers; never separately insert bill lines or deduct stock, because partial uploads are unsafe.
- Receipt calibration is device-local and shared by receipt generation and the alignment ticket, so physical printer settings do not alter another device.
- The kitchen USB printer is device-local, uses its own USB connection in parallel with the counter receipt, and the counter USB reconnect must skip it; station Bluetooth mappings stay for non-kitchen stations, so one cart never prints the same station twice.
- Read .agents/AGENTS.md for existing product naming conventions.