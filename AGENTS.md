# ZenPOS architecture

- Quick counter checkout reuses Billing payment calculations and the pending-bill outbox rather than a separate billing route, so tax, permissions and receipt settings stay consistent.
- Replay pending bills through secure_create_bill with their original bill numbers; never separately insert bill lines or deduct stock, because partial uploads are unsafe.
- Receipt calibration is device-local and shared by receipt generation and the alignment ticket, so physical printer settings do not alter another device.
- The kitchen USB printer is device-local, uses its own USB connection in parallel with the counter receipt, and the counter USB reconnect must skip it; station Bluetooth mappings stay for non-kitchen stations, so one cart never prints the same station twice.
- Online-menu payment choice (shop_settings.remote_payment_methods) is enforced by a BEFORE INSERT trigger on remote_orders, and the checkout UI only mirrors it via src/utils/remotePaymentMethods.ts, because customers can bypass the UI and insert directly.
- Read .agents/AGENTS.md for existing product naming conventions.
- Public menu device caching must revalidate through public-safe RPCs; session storage is not CDN edge caching and must never contain private operational data.
- Portal theme settings reuse useBranchSettings for owner identity, active-branch persistence and inheritance rather than issuing separate settings queries.
- Notification workers use bounded parallel leased claims with claim-specific acknowledgement; retry only zero-success transient failures to avoid duplicating partial deliveries.
- Counter connection heartbeats contain only device labels and timestamps, run independently of billing, and are owner-scoped by RLS; freshness is not proof of printer or payment health.
- Monthly bill archives remain preparation-only until historical readers, durable references, authorized edits and original-number replay are verified; never remove live bills or schedule moves before those gates pass.