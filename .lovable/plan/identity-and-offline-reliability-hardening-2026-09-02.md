# Identity and Offline Reliability Hardening

## Confirmed audit result

ZenPOS has a strong offline-resilient foundation, but it is not yet a fully offline application across every page and workflow.

- The tenant key is `profiles.id`. Tenant-scoped `admin_id` fields must always use this value.
- The login identity is `auth.users.id`, exposed as `profiles.user_id`. It belongs only in identity fields such as `user_id` and `created_by`.
- Current sub-users correctly point to their parent admin profile, and the inspected tenant rows use profile IDs.
- `tax_rates` currently contains a profile ID, and its access policies expect profile IDs. Several frontend call sites still use an auth UID for tax-rate reads/writes, and the live table has no foreign key enforcing the intended contract.
- Native SQLite is installed and compiled on Android/iOS. It uses WAL and batched writes, but generic offline writes still pass through a legacy IndexedDB queue, update/delete filters are missing from the SQLite queue contract, the database is unencrypted, and queue replay is not fully serialized.
- The selected offline policy is **7 days after the last successful server verification**. The app must not claim unlimited offline use.
- Table CRUD has broad offline coverage. RPCs, file uploads, edge functions, cloud payments, FCM, realtime delivery, and cross-device synchronization still require connectivity or an explicit queued substitute.

## Implementation

### 1. Make the identity contract unambiguous

- Establish one typed tenant resolver used by all feature code:
  - `adminProfileId`: tenant key for every `admin_id` and branch-scoped operation.
  - `authUserId`: current signed-in identity for `user_id`/`created_by`.
  - `adminAuthUid`: retained only for legacy schemas that explicitly store the owner auth UID, such as `shop_settings.user_id`.
- Replace the confirmed incorrect tax-rate call sites in GST Settings, Billing, Table Billing, Waiter Companion, and item dialogs with `adminProfileId`.
- Remove misleading comments and ambiguous local variables that describe tax-rate ownership as an auth UID.
- Add a database migration that validates existing `tax_rates.admin_id` values and enforces a foreign key to `profiles.id` without changing valid data.
- Add automated contract tests that fail when a tenant `admin_id` is populated or queried with an auth UID.

### 2. Make native SQLite the single durable queue on Capacitor

- Route generic queued writes through the configured `StorageBackend`; stop writing native mutations directly to the legacy IndexedDB queue.
- Extend `WriteQueueEntry` and the SQLite schema to persist complete mutation filters for update/delete replay.
- Add a real schema upgrade version with migration coverage instead of modifying version 1 in place.
- Serialize queue claims and replay so two reconnect triggers cannot send the same operation concurrently.
- Preserve retries, errors, timestamps, and idempotency identifiers in SQLite; expose exhausted entries to the existing sync diagnostics rather than silently stranding them.
- Keep IndexedDB as the PWA backend and emergency native fallback, while preventing both stores from acting as concurrent sources of truth.
- Never auto-delete an unsynced bill or queued mutation during retention cleanup.

### 3. Harden SQLite durability and device security

- Use the SQLite plugin capability API instead of error-message matching to select native mode.
- Check connection consistency and recover stale connections during startup.
- Apply WAL and required pragmas on every connection open.
- Add migration row-count verification for the one-time IndexedDB-to-SQLite transfer.
- Enable encrypted native storage through the plugin’s secure-secret flow, backed by Android Keystore/iOS Keychain, with a safe migration path for existing unencrypted databases.
- Keep web/PWA storage unencrypted at the database layer and clearly treat browser storage as less durable than native SQLite.

### 4. Enforce the chosen 7-day offline policy correctly

- Preserve first-online-login and cached-profile restoration for offline startup.
- Store the signed license anchor in secure native storage rather than ordinary local storage alone; include tenant, user, device installation, last verification time, expiry, and policy version.
- Require an online license refresh by day 7. After that, show a clear reconnect-required lock screen without deleting local business data.
- Keep the 30-day auth-session policy separate from the 7-day license check and make their messages distinguishable.
- Queue pending local data safely while locked and resume synchronization after successful online verification.
- Do not market or display “unlimited offline”: seven days is the explicit operating limit.

### 5. Define honest offline behavior page by page

- Audit each route and classify actions as:
  - fully local: cached reads, supported CRUD, billing, Bluetooth printing;
  - queued: supported database mutations and deferred uploads/RPC substitutes;
  - online required: AI, FCM delivery, cloud payments, password/admin operations, and workflows that cannot safely replay.
- Add explicit offline guards for online-only actions so users receive a precise message instead of a generic failure.
- Add durable upload queuing for supported receipt/menu images.
- For critical RPC workflows, add a local command/outbox representation only where replay is safe and idempotent; otherwise require internet before starting the action.
- Label the existing BroadcastChannel helper accurately as same-device/tab synchronization; it is not cross-device LAN sync.

### 6. Conflict safety and performance

- Add row version/updated-at checks for replayed updates and surface conflicts rather than silently overwriting newer server data.
- Require a device-specific bill-number prefix or durable client UUID to avoid duplicate offline numbers across devices.
- Consolidate duplicate sync triggers and overlapping queue systems behind one coordinator.
- Avoid double-caching the same payload where React Query persistence and the offline cache overlap.
- Retain local-first printing so Bluetooth receipts remain independent of network availability.

## Validation

- Database checks: every populated tenant `admin_id` resolves to `profiles.id`; tax-rate foreign key and branch policies pass for admin and sub-user roles.
- Unit tests: identity resolver, queued filter persistence, queue claiming, retries, conflicts, retention safety, seven-day boundary, clock rollback, and locked-data preservation.
- Native tests: install fresh, migrate existing data, kill during write, restart offline, create/edit/delete records, save and reprint a bill, reconnect, and verify one-time replay.
- PWA tests: cached startup, IndexedDB persistence, supported offline CRUD, reconnect replay, and clear online-only messaging.
- End-to-end roles: admin and child user first login online, seven days offline allowed, day-eight lock, reconnect verification, and tenant isolation.
- Run authorization tests, preview build checks, Supabase linter review, Android sync/build validation, and browser smoke tests before declaring completion.

## Expected outcome

- Identity mistakes become difficult to introduce because tenant and auth IDs have separate names, types, database enforcement, and tests.
- Capacitor uses native SQLite as the authoritative durable store and queue, with encryption and deterministic replay.
- PWA remains offline-resilient through IndexedDB but carries normal browser-storage limitations.
- ZenPOS can accurately claim: **core POS billing, local data access, and Bluetooth printing work offline for up to seven days after verification; cloud and cross-device services resume when internet returns.**
