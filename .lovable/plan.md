# ZenPOS: competitive review, ID cleanup, offline/APK truth, payments

## Answers to your questions (verified against the code and DB)

### 1. Can it compete? Where it stands today
Verified strengths (real code, not stubs): 84+ tables with per-tenant RLS, billing + KOT split printing per station, tables/KDS/waiter/service area with realtime, QR public menu + remote orders + feedback, purchases/GRN/returns, stock ledger + batches + adjustments + transfers, expenses, CRM/khata, shifts + Z-report + reconciliation history, branches, sub-users with page permissions, FCM push (web + native), AI insights + AI menu import, encrypted backups + scheduled cloud backup, super-admin console with storage quotas and licensing, and a universal offline layer that wraps every `supabase.from()` call.

That feature depth matches or beats most ₹500–₹1,500/month Indian POS products. The gaps that stop it from being "world class" are listed in section 6.

### 2. Can you launch now?
Yes for a controlled pilot (20–40 outlets). Two blockers should be fixed first (both in the work plan below): the APK is not actually offline-capable, and the admin-id inconsistency will keep breaking new features.

### 3. The auth-id vs profile-id confusion — root cause confirmed
Confirmed by querying the live database:
- Almost every tenant table stores `admin_id = profiles.id` (verified on `bills`, `items`, `stock_ledger`, `purchases`, `branches`, `suppliers`, `feedback_forms`, `stock_adjustments`, …).
- `tax_rates.admin_id` has a foreign key to `profiles(user_id)` — i.e. it stores the **auth uid** instead. It is the one true outlier.
- ~35 tables have `admin_id` with **no foreign key at all**, so nothing stops the wrong ID being written by a future feature.
- `profiles` and `user_permissions` mix raw `auth.uid()` policies with `get_my_profile_id()` / `get_my_admin_id()` policies on the same table.
- The client keeps both `adminProfileId` and `adminAuthUid` in `AuthContext`, and 19+ files pick one by hand — that is where "something went wrong" comes from.

### 4. Offline forever after one online login? — No, not today
Two hard facts:
- `capacitor.config.ts` sets `server.url = https://zen-pos.vercel.app`. The APK loads the UI from the internet, so with no network the app cannot even boot. The offline layer only helps once the page is already loaded.
- `offlineLicenseManager` locks the app after `DEFAULT_GRACE_DAYS = 7` days without an online license check. So "millions of days offline" is not possible; 7 days is the current ceiling, by design.

Both are addressed in the work plan (bundle the web assets, make the grace window configurable per client).

### 5. `npx cap sync` — do clients reinstall?
While `server.url` stays set: UI changes reach the APK automatically on next app open, no reinstall. A new APK is only needed for native changes (plugins, Java/Swift, icons, permissions). **After** we remove `server.url` to make the app truly offline, every release will require a new APK — that is the trade-off, and the plan adds an in-app update prompt for it.

### 6. Capacitor SQLite vs IndexedDB — how it works here
- Web/PWA → `IndexedDBBackend` (jeep-sqlite WASM is deliberately skipped; it fails to link in several browsers).
- Native → `SQLiteBackend`. The `@capacitor-community/sqlite` plugin is installed and compiled into the Android project (confirmed in `capacitor.build.gradle`), so real native SQLite is used, with a WASM fallback if the bridge is missing.
- SQLite wins on: real SQL filtering/indexes, batched transactions (`executeSet`, 500-row chunks), no browser storage eviction, and much faster large reads (reports, item lists). IndexedDB is key-value only, so bigger queries load and filter in JS.
- Current state is solid but not yet world class: writes go through a debounced persist timer, there is no encryption at rest, and `getIndexedColumns` indexes only a few columns, so some lookups still scan and JSON-parse rows.

### 7. Payment gateway: Cashfree vs Razorpay vs PhonePe
I will not state Cashfree's "free up to ₹20L" as fact until it is verified — I will confirm current pricing on each provider's official pricing/docs page and give you a table (per-transaction fee, UPI vs card rates, subscriptions/e-mandate support, settlement time, onboarding/KYC, payout limits, hidden charges). The architecture point matters more: your gateway code already sits behind edge functions (`payments-create-link`, `payments-create-mandate`, `payments-webhook`), so switching or supporting multiple providers is a driver swap, not a rewrite. The plan makes that driver boundary explicit so you can run Cashfree, Razorpay or PhonePe per client.

## Work plan

### Phase 1 — Fix the ID confusion permanently (highest value)
1. Standardise on `profiles.id` as the tenant key everywhere. Migrate `tax_rates.admin_id` to `profiles.id` (backfill, then repoint the foreign key and its policies).
2. Add a `FOREIGN KEY (admin_id) REFERENCES profiles(id)` to every tenant table that currently has none, so a wrong ID fails loudly at insert time instead of silently returning zero rows.
3. Rewrite the mixed policies on `profiles` and `user_permissions` to use `get_my_profile_id()` / `get_my_admin_id()` only.
4. Client side: expose one `useTenant()` hook returning `{ adminProfileId }`, mark `adminAuthUid` deprecated, and migrate call sites away from it.
5. Add an authorization test that fails if any tenant table is queried with an auth uid.

### Phase 2 — Make the APK genuinely offline
6. Remove `server.url` from `capacitor.config.ts` and ship the built `dist` inside the APK, so cold start works with zero network.
7. Add an in-app version check with an "Update available" prompt (only when online), since updates now require a new APK.
8. Make the offline grace window a per-client setting in the super-admin console (7 / 30 / 90 / 365 days) instead of a hardcoded 7.
9. Cache the login credential/session locally so a returning device signs in offline after its first successful online login.

### Phase 3 — SQLite and speed hardening
10. Flush SQLite synchronously after money-critical writes (bills, payments, shift close) instead of relying only on the debounced timer.
11. Widen indexed columns in `schema.ts` (admin_id, branch_id, created_at, status) so reports filter in SQL rather than in JS.
12. Add SQLite encryption for on-device business data.
13. Profile and fix the slowest screens (Items, Reports, Billing cold start) with virtualised lists and narrower selects.

### Phase 4 — Payments
14. Verify current Cashfree / Razorpay / PhonePe / Paytm pricing from official sources and deliver the comparison table plus a recommendation.
15. Refactor the payment edge functions into a provider-driver interface and add a Cashfree driver alongside the existing ones, selectable per client.

### Phase 5 — Feature gaps to reach "world class" (scoped after you pick)
GST e-invoicing (IRN/QR) and e-way bill, recipe/BOM costing with live food-cost %, loyalty and coupons, employee attendance and payroll-lite, multi-outlet consolidated dashboard, customer-facing order status screen, inventory wastage tracking, day-close cash counting, and an owner mobile summary. These are listed in priority order; I will not build them until you choose.

## Technical notes
- All database changes in Phase 1 run as migrations with backfill-first ordering so no live data is orphaned.
- Phase 2 changes how releases are shipped; the current auto-update behaviour disappears once `server.url` is removed.
- No Zomato/Swiggy or Razorpay-only lock-in is introduced anywhere in this plan.
