# Device Lock + Full Offline Client App (and the ₹999/month question)

## 1. Pricing reality check (answer first, no code)

A ₹7,999 lifetime software is almost always a *local desktop billing exe*: one PC, no cloud, no sync, no support, no updates, no multi-user, no QR ordering, no backups. The seller earns once and disappears. That product and ZenPOS are not the same category.

What ₹999/month actually buys the shop:
- Cloud + backups + restore (server cost is recurring, so the price is recurring)
- Works on phone, tablet and counter at the same time, staff roles, live KDS
- Offline billing that syncs back — no lost sales during network cuts
- QR menu, remote orders, CRM, khata, stock and purchases
- Updates, GST changes, WhatsApp support

Sales framing that works: one saved bill dispute or 30 minutes of manual counting per day already exceeds ₹33/day. Compare against a part-time helper (₹6,000–₹10,000/month), not against a ₹7,999 exe.

Realistic tiering for India:
- Calci-only (single counter, quick keys, thermal print, day report): ₹299–₹499/month, or ₹4,999 lifetime-on-device for price-sensitive kirana buyers
- Standard (tables, KDS, stock, CRM, QR): ₹999/month
- Multi-branch / franchise: ₹1,999–₹2,999/month

Valuation: the ₹22–32 lakh figure in the earlier report is *rebuild/asset* value, not what a shop pays. Nobody buys a ₹30 lakh product for ₹999 — they rent a slice of it. Valuation only becomes real when paying outlets exist; each paying outlet adds roughly ₹1–1.5 lakh of company value.

## 2. What exists today (verified)

- `user_devices` currently stores only push tokens (`device_token`, `platform`, `enabled`) — there is no hardware device identity and no binding/limit logic.
- Offline login already works partially: `AuthContext` reads an encoded cached profile from localStorage and returns it when `navigator.onLine` is false; `offlineLicenseManager` caches a verified license and supports a forced-logout flag.
- `syncEngine` is push-only (queued local writes flushed upward); there is no server→device pull cursor.
- Local storage backend is SQLite on native, IndexedDB on web.

## 3. What gets built

### A. Device binding + lock
1. New table `client_devices`: `id`, `user_id`, `admin_id`, `device_hash`, `label`, `platform`, `app_version`, `status` (`active` / `blocked`), `bound_at`, `last_seen_at`. Grants for `authenticated` + `service_role`, RLS scoped so a user sees only their tenant's rows and super-admin sees all.
2. `device_hash` derived on native from Capacitor Device id + install id, salted and hashed; on web from a persisted random id in secure storage. Never a raw IMEI.
3. RPCs (SECURITY DEFINER, fixed `search_path`):
   - `bind_device(hash, label, platform, app_version)` → binds or refuses when the account is at its device limit or the hash is blocked
   - `heartbeat_device(hash)` → updates `last_seen_at`, returns license + block state
   - `admin_set_device_status(device_id, status)` → super-admin block/unblock/unbind
4. Per-account `device_limit` column on `profiles` (default 1 for Calci tier, configurable by super-admin).
5. Super-admin UI: device list per client with last-seen, platform, and block/unbind buttons.

### B. Signed offline license
- On every successful online contact the server returns a short-lived signed license blob: `{admin_id, device_hash, plan, expiry, grace_days, device_limit}`, signed with a server key.
- The app verifies the signature locally and stores it encrypted. Expired grace = app locks to a "reconnect required" screen; billing is blocked, data is preserved.
- Grace window default 14 days, super-admin configurable per client.
- A copied APK on new hardware produces a hash mismatch against the stored license and is refused **offline as well**, not just online.

### C. Offline auth vault
- First login online creates an encrypted credential envelope unlocked by a 4-digit PIN or biometric (reuse `biometricAuth` and the existing PIN pattern).
- Subsequent app opens never hit Supabase: PIN/biometric → decrypt envelope → restore cached profile, permissions and license.
- Logout still clears the vault and the local database.

### D. Full local mirror + two-way sync
- Extend the local schema beyond items/bills to categories, taxes, customers, khata, suppliers, purchases, stock ledger, settings, users and permissions.
- Add a `last_synced_at` cursor per table and a pull phase to `syncEngine`, keeping the existing push queue. Last-write-wins with a conflict log the admin can view.

### E. End-to-end walkthrough (delivered after build)
Using a real browser tab plus the native build path:
1. First online login → device binds → license cached → PIN set
2. Airplane mode → app opens via PIN → items load from local mirror → create an order, take payment, print/preview KOT and bill
3. Reconnect → sync engine flushes the bill and pulls server changes → bill visible in Reports and Z-report
4. Super-admin blocks the device → next heartbeat locks the app; unblock restores it
5. Push Notifications settings card walked end to end in a real tab (enable → token registered in `user_devices` → send test → notification received), after publishing.

## 4. Order of work

```text
Step 1  client_devices table + RPCs + device hash + binding on login
Step 2  Signed offline license + grace lock screen + super-admin device UI
Step 3  Offline auth vault (PIN/biometric)
Step 4  Full local mirror + two-way delta sync + conflict log
Step 5  Publish, then walk login, offline order, and push card end to end
```

## 5. Notes and honest limits

- An app that never contacts the server again cannot be remotely controlled. The grace window (7–30 days, super-admin set) is the workable compromise.
- Device hashing on web is weaker than native (clearing site data resets it); the strong lock applies to the Capacitor APK.
- Publishing happens at Step 5; native APK changes still need `git pull` + `npx cap sync` on the user's machine before the device-lock code runs on a phone.
