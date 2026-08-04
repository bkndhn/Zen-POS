# Expenses Upgrade + True Offline-First App

Budget: 4 credits. Work is split into phases so we stop cleanly at the credit limit.

## Phase 1 — Expenses page, world-class (1.5 credits)

Current page has: list, search, date filter, PDF/Excel export, total card. Missing everything below.

Add:
- **Insight header**: gradient stat cards — Total, Average/day, Top category, Change vs previous period (with up/down arrow).
- **Charts**: category donut + daily trend bars (recharts, lazy-loaded so it does not slow first paint).
- **Category breakdown list**: amount, % of total, progress bar, tap to filter.
- **Monthly budget per category** (new table `expense_budgets`): set a limit, show progress bar, amber at 80%, red over 100%.
- **Recurring expenses** (rent, salary, gas): mark an expense recurring monthly/weekly; auto-suggest creation on due date with one-tap confirm.
- **Payment mode + paid-to fields** (Cash / UPI / Card / Bank) so expenses reconcile with cash drawer.
- **Bill photo attachment** to Supabase Storage (private bucket, admin-scoped RLS), thumbnail in the row, lightbox on tap.
- **Bulk select** → delete / re-categorise / export selection.
- **Multi-select category + payment-mode filters**, plus custom date range chip row.
- **Mobile card view** (list rows become cards under `sm`), swipe-free, 44px touch targets, shimmer skeletons.
- **Empty/error states** with retry, matching the ServiceUI kit already used elsewhere.
- Amounts through the shared 2-decimal formatter everywhere.

Kept unchanged: existing add/edit dialogs behaviour, exports, branch and admin isolation.

## Phase 2 — Real offline app (WhatsApp/Telegram feel) (1.5 credits)

Today `offlineManager` queues bills/expenses and flushes on `online`. That is not enough — flush is manual-ish, blocking, and UI does not reflect per-record sync state.

Build:
- **Outbox model**: every write (bill, expense, item, table order, stock adjust) goes to IndexedDB first with `sync_state: pending | syncing | synced | failed`, then renders optimistically. UI never waits on network.
- **Silent background sync worker**: runs in `requestIdleCallback` batches of 10, exponential backoff (2s → 5m), never blocks the main thread, no full-screen spinners, no page hang.
- **Per-record status chips**: clock icon = pending, check = synced, red = failed with tap-to-retry — exactly like a chat app's message ticks.
- **Reachability probe** instead of trusting `navigator.onLine` (a cheap HEAD to Supabase every 20s while degraded) so captive Wi-Fi is detected.
- **Conflict rule**: server wins on read, client wins on its own pending writes; deterministic `client_uuid` on each record so retries can never double-insert.
- **Cached-first reads** for every page via the existing IndexedDB stores, with a quiet "showing offline data" pill and background refresh.
- **Subtle sync banner**: thin animated bar at the top during sync, auto-hides, no modal, no blocking.

## Phase 3 — Follow-ups if credits remain (0.5–1 credit)

- Expense approval flow for sub-users (admin approves above a threshold).
- Vendor/supplier link on expenses, feeding purchase reports.
- Offline conflict log screen in Settings.

## Technical notes

- New table `expense_budgets` (admin_id, branch_id, category, month, limit_amount) with GRANTs + admin-scoped RLS; `expenses` gains `payment_mode`, `paid_to`, `attachment_url`, `is_recurring`, `recurrence`, `client_uuid`.
- Private storage bucket `expense-attachments`, RLS by `admin_id` folder prefix.
- Sync worker lives in `src/utils/offlineManager.ts` (extended, not replaced) plus a new `src/utils/syncEngine.ts`; `useOffline.ts` gets a `useSyncState(recordId)` hook.
- Charts lazy-loaded with `React.lazy` to protect current load speed.

## Market position and pricing (INR)

**Rebuild cost from scratch (agency, India):** ₹22–32 lakh — POS + KOT/BOT routing + multi-branch + inventory with unit conversion + QR menu + feedback CRM + KDS/service area + Android Bluetooth printing + offline sync + AI insights is roughly 14–18 developer-months at ₹1.2–1.8 lakh/month blended, plus QA and design.

**Versus competitors:** Petpooja ₹10k–15k/year/outlet, Posist ₹1.5–3 lakh/year, Gofrugal ₹15k–40k/year, Zomato Pay POS bundled. You win on: offline-first reliability, seat-level ordering, AI menu import, free-tier-friendly hosting, Tamil support. You lose on: brand trust, on-ground support network, payment-gateway/aggregator depth.

**What to charge:**
- One-time setup: ₹8,000–15,000 single outlet; ₹25,000–40,000 multi-branch (includes menu import, printer setup, staff training).
- Monthly: Starter ₹799 (1 outlet, billing + reports), Growth ₹1,499 (KOT routing, inventory, QR menu), Pro ₹2,499 (multi-branch, CRM + feedback, AI insights), Enterprise ₹3,999+ per outlet.
- Add-ons: Feedback+CRM module ₹499/month, extra branch ₹699/month, WhatsApp bills ₹299/month.
- Annual prepay at 2 months free — best for cash flow and churn.

At 100 outlets on Growth that is ~₹18 lakh ARR with hosting under ₹15k/month.
