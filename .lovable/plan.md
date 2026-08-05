# Expenses Polish + Analytics + Bulletproof Offline Licensing

Three connected pieces of work, plus a small pre-step. Delivered in the order below so each one can be checked before the next.

## 0. Clear the existing build errors (pre-step)

The project currently fails typecheck, unrelated to the new work. These get fixed first:

- `DashboardAnalytics.tsx` — the three result variables (`rawBillsData`, `expensesData`, `billItemsData`) are declared as arrays but also used as an object payload when caching/restoring; the cache payload needs its own typed object instead of reusing the array variables.
- `Purchases.tsx` — `purchaseData` is referenced after the insert block but never captured from the insert response; capture it (or drop the initial-payment block's dependency on it).
- `Purchases.tsx` — `profile.business_name` does not exist on the `Profile` type; use the existing shop/hotel name field.


## 1. Expenses page — world-class UI

Rework `src/pages/Expenses.tsx` presentation only (queries, branch scoping, and export logic stay as they are):

- Frosted sticky header matching the shared service UI kit already used by Tables/KDS, with the page title, live totals, and actions on one compact row.
- Inline total tiles above the list: Total spent, Transactions, Average per entry, Top category — recalculated from the currently filtered set, so they always reflect the active search and date range.
- Shimmer skeletons for the header tiles, filter bar, and table rows instead of the current blank/loading state.
- Filter/search made instant: debounced search input (existing `useDebounce`), memoized filtering instead of the current effect-driven `setFilteredExpenses` round trip, and date-range presets as compact chips (Today / Yesterday / 7d / Month / Custom).
- Typography and spacing normalised to the same scale as the other polished pages; mobile gets stacked cards, desktop keeps the table.
- Row-level sync tick (pending / synced) using the existing sync-engine record state, since expense writes already go through the outbox.

## 2. Expense analytics

New `src/components/expenses/ExpenseAnalytics.tsx`, rendered on the Expenses page in a collapsible "Insights" section:

- **Category breakdown** — donut chart plus ranked list with share percentages (recharts, already a dependency).
- **Daily trend** — bar/area chart of spend per day across the selected range, with a rolling average line.
- **Cashflow impact** — expenses for the range compared against sales revenue for the same range, showing gross margin after expenses and expense-to-revenue ratio.

All three compute from data already in the local cache, so they render offline from cached expenses/bills and refresh silently when the sync engine reports a completed flush. No new tables.

## 3. Capacitor offline + background licence enforcement

Current state that needs changing:

- `capacitor.config.ts` sets `server.url` to the hosted Vercel site, so the Android app is a remote-loading shell — with no connection it shows a blank/error page regardless of how good the web caching is.
- Licence checks only run while the app is open and mounted (`Layout`, `OfflineLicenseBanner`); there is no scheduled background verification.

Work:

- **Bundle the app for real offline use** — drop the remote `server.url` so the native build serves the bundled `dist` assets from the device, keeping only the Lovable dev-time hot-reload path behind an env flag. Document the `npm run build && npx cap sync` step the user must run after pulling.
- **Native durable storage** — route the existing IndexedDB caches and sync outbox through the native storage persistence helper so Android does not evict them, and add a startup integrity check that rebuilds the cache if the store was cleared.
- **Weekly background licence verification** — a background task that runs on app resume and on a scheduled interval (at minimum once every 7 days, attempted daily when a connection is available) calling the existing `syncSubscriptionLicense`. Results are written to the tamper-checksummed licence payload already in `offlineLicenseManager`.
- **Hard enforcement** — when the verified licence comes back expired or force-logged-out, the app signs the user out, clears the session, and blocks re-login at the auth screen with a renew prompt until a fresh online verification returns an active subscription. Offline launches past the grace window fall into the existing lockout state rather than silently allowing access.
- **Anti-spam / anti-tamper** — keep the existing clock-tamper and checksum guards, add a minimum interval between verification calls so resume events cannot hammer the endpoint, and make the enforcement decision depend on the server response rather than any client-writable flag.

## Technical notes

- Expenses stays a single page component plus one analytics child; no route changes.
- Analytics reads bills from the existing cached bill query used by Reports, filtered by branch, so branch and client isolation are unchanged.
- Licence scheduling uses the Capacitor App resume listener plus a persisted `lastVerifiedAt` timestamp; on web it degrades to the existing on-mount and online-event checks.
- Removing `server.url` changes how the Android app loads. It requires a rebuild and `npx cap sync`; existing installs keep working only after that rebuild is shipped.
