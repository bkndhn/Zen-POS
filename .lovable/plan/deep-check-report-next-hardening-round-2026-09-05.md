# Deep Check Report + Next Hardening Round

## 1. Verified state right now (checked this turn)

- Build: `build OK` (latest entry, 2026-09-04T04:21Z).
- Tests: 44 passed, 13 skipped (authorization + identity/offline suites).
- Identity helpers exist and are wired: `src/utils/identity.ts` (`resolveAdminProfileId`, `resolveAuthUserId`) and `useTenant.ts` now exposes `adminProfileId`, `authUserId`, `adminAuthUid`.
- SQLite backend now: schema v2 with migrations, native WAL + `synchronous=FULL`, `foreign_keys=ON`, busy timeout, connection-consistency recovery, WASM fallback for web/PWA, flush on pagehide/visibility.
- SQLite encryption is now actually enabled on native: a random passphrase is stored once via `setEncryptionSecret`, first run converts a legacy plaintext DB (`encryption` mode), later runs open with `secret`, with a fallback re-open path if conversion had not happened.
- Offline license policy is fixed at 7 days since last successful verification (`DEFAULT_GRACE_DAYS = 7`), plus staged degradation (warning ≤7, limited ≤15, locked after).

## 2. Answers to your questions

### Auth ID vs Profile ID
The rule is now enforced in one place, so future features should not repeat the bug:
- Tenant ownership (`admin_id` on every business table) = `profiles.id` → use `adminProfileId` from `useTenant()`.
- Session/auth identity (`profiles.user_id`, `auth.uid()` comparisons) = `authUserId`.
- Only legacy exception: `shop_settings.user_id` stores the owner auth UID → use `adminAuthUid`.
Remaining risk: this is a convention, not a compile-time guarantee. Nothing stops a new screen from passing `user.id` into `admin_id` again.

### Can I use it forever offline after one online login?
No. The chosen policy is deliberate: after 7 days without a successful server verification the app locks new billing. That is a licensing decision, not a technical limit — unlimited offline use would make the subscription unenforceable and lets one APK run free forever. If you want longer, the honest lever is raising the grace window (e.g. 14/30 days) per client, not removing the check.

### Is Capacitor SQLite world-class now?
Much closer, but not finished. Solid: encryption, migrations, WAL/full-sync durability, crash recovery, batch writes, universal fallback. Still missing: atomic queue claiming (a replay can pick the same row twice if two flushes overlap), no integrity self-check / auto-repair on corrupt DB, no passphrase rotation or recovery if the secret is lost, and no compaction/retention for the cache tables.

### How true is "offline" today?
Strong for the core POS loop: cached reads via the universal `.from()` layer, queued writes with filters, offline billing, printing, shifts. Still online-only: 39 files call `supabase.rpc`, `functions.invoke` or `storage.from`, and only 1 file uses `requireOnline()` — so most of those paths still fail with a raw error instead of a clean "needs internet" message. Realtime, FCM delivery, Storage uploads and cross-device sync remain online by nature.

## 3. Proposed next round

1. Guard the online-only surface: apply `requireOnline()` + a friendly toast to the remaining RPC / edge-function / Storage call sites (purchases, backups, AI import, push, reports export).
2. Atomic queue claiming: single `UPDATE ... SET status='syncing' WHERE status='pending'` claim step so overlapping flushes cannot double-post a bill.
3. SQLite self-healing: `PRAGMA integrity_check` at startup; on failure, quarantine the DB, rebuild schema and preserve unsynced queue rows.
4. Identity guardrail: a dev-time assertion + lint-style test that fails when a value matching an auth UID is written into any `admin_id` field.
5. Retention/compaction for `offlineCache` (age + row cap) so the local DB does not grow unbounded on long offline runs.
6. Optional, your call: make `graceDays` server-configurable per client instead of hardcoded 7.

### Technical notes
- Files touched: `src/utils/storage/SQLiteBackend.ts`, `src/utils/storage/schema.ts`, `src/utils/offlineManager.ts`, `src/utils/onlineGuard.ts`, `src/utils/identity.ts`, plus the call sites found by the RPC/Storage scan.
- No schema migration needed except if item 6 is accepted (a `grace_days` column on profiles).
- I cannot build, sign or install an APK from here; after these changes you still need `CAPACITOR_BUILD_MODE=offline npm run build` → `npx cap sync android` → reinstall.
