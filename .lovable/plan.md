# ZenPOS — Worth, Launch Readiness, Offline Lock & Feature Gaps

## 1. What actually exists today (verified)

- ~98,900 lines across 294 TypeScript/React files, 38 pages, ~100 feature components, 84 Supabase tables, 100+ database functions, 17 edge functions.
- Modules live: Calci Billing, Table/KOT service, KDS, Waiter Companion, Items + variants + batches, Stock (ledger, adjustments, transfers, reorder), Purchases + GRN + returns + supplier ledger, Expenses + budgets, CRM + Khata, Reports + Z-report + shift reconciliation, Analytics + AI insights, QR public menu + remote ordering + feedback, Branches, Users/roles/permissions, Subscription + super-admin console, Bluetooth/USB thermal printing, backups (local AES-256 + pg_cron cloud), push (native + web FCM), RUM + Sentry monitoring, i18n EN/TA.
- Offline layer confirmed: SQLite (native) / IndexedDB (web) backend, cached profile + cached license for offline login, sync queue currently handling bills, expenses, items, table orders and tables.

Conclusion: this is a real, production-grade product, not a demo.

## 2. Valuation in INR

| Basis | Value |
|---|---|
| Rebuild cost (agency, 4–5 devs, 12–14 months) | ₹38–52 lakh |
| Asset sale today (code + DB + native apps, no revenue) | ₹22–32 lakh |
| With 30–50 paying outlets at ₹999/mo (ARR ~₹4–6 L) | ₹45–70 lakh (8–12x ARR SaaS multiple) |
| With 300+ outlets and clean churn data | ₹2–4 crore |

The gap between rebuild cost and sale price is the "no revenue yet" discount. Every paying pilot outlet you add is worth roughly ₹1–1.5 lakh of valuation.

### Calci feature alone vs combined
- Calci billing standalone (quick keys, offline bill, thermal print, day report): a sellable ₹299–₹499/mo micro-product; standalone worth ₹4–7 lakh. It is the strongest single wedge because a kirana/bakery owner understands it in 30 seconds.
- Combined suite (Calci + tables + stock + purchases + QR + branches): worth ~5x the standalone, because switching cost becomes total — the shop's stock, khata and history all live inside. Sell Calci as the entry tier, upsell the rest.

## 3. Can you launch now?

Yes — a controlled paid pilot, not a mass launch. Free Vercel + free Supabase supports roughly 30–50 outlets. Before charging: real-device print QA on 5+ printer models, GST invoice format signed off by 2 accountants, an onboarding kit (Tamil + English video, CSV item import, printer pairing sheet), and a keep-alive cron so Supabase never auto-pauses.

## 4. Competitor position (Petpooja, Gofrugal, Posist, DotPe, Zomato Base)

Where ZenPOS already wins: true offline-first with a device sync engine, ₹999 vs ₹1,500–₹3,000 pricing, Tamil-first UI, QR ordering + feedback + CRM bundled instead of paid add-ons, AI menu import from a photo, encrypted local backup, per-tenant storage quotas.

Where competitors still win: GST e-invoice/IRN, aggregator sync, recipe costing, loyalty, and a mature onboarding/support machine.

## 5. Features to add (excluding Razorpay and Swiggy/aggregator work)

**Tier 1 — needed before charging money**
1. GST e-invoice (IRN + QR) and GSTR-1/3B export — legally blocking for ₹5cr+ outlets and the top objection in demos.
2. Recipe / BOM costing with automatic raw-material depletion — the tables exist (`recipes`, `ingredients`) but costing and per-dish margin reporting are not surfaced.
3. Day-end cash-drawer flow polish: denomination counting, short/excess reasons, manager approval on variance.
4. Bulk item import/export via CSV with error preview.

**Tier 2 — retention and stickiness**
5. Loyalty wallet + points redemption on the bill screen.
6. Staff attendance, shift-wise sales and incentive report.
7. Wastage/spoilage entry with reason codes feeding into P&L.
8. Multi-brand / franchise consolidated dashboard on top of existing branches.
9. Customer WhatsApp campaign push from CRM segments (repeat, lapsed, high-value).

**Tier 3 — differentiation**
10. Voice billing in Tamil (partially present — finish and harden).
11. Predictive reorder using sales velocity and lead time.
12. Table turn-time and waiter performance leaderboard.

## 6. Fully offline Capacitor app — what is possible and what has to be built

Target you described: first login online against Supabase, after that everything runs from the device; super-admin can still control users; APK cannot be copied to another device.

What already works: cached profile + cached license enable offline app open; SQLite stores items and bills; the sync engine flushes bills, expenses, items, tables and table orders when connectivity returns.

What must be added for true full-offline:

1. **Offline auth vault** — on first successful login, store an encrypted credential envelope (PIN or biometric unlocks it) so subsequent logins never touch Supabase. Session validity extends to the license window rather than 12 hours while offline.
2. **Full local mirror** — extend the local schema beyond items/bills to categories, taxes, customers, khata, suppliers, purchases, stock ledger, settings, users and permissions, so every screen renders offline. Today several screens still assume network.
3. **Two-way delta sync** — a `last_synced_at` cursor per table pulling server changes, with last-write-wins plus a conflict log, instead of the current push-only queue.
4. **Device binding / anti-APK-sharing** — on first login, register a hardware-derived device id in `user_devices` and enforce a per-account device limit (super-admin sets it). A second device is refused, and `blocked_devices` (table exists, currently unused for staff login) becomes the kill switch. Store a signed device token locally so a copied APK on new hardware fails offline as well.
5. **Signed offline license** — server issues a short-lived signed license blob (device id + expiry + limits) at each online contact. The app verifies the signature locally; expiry ends the grace window. This is what makes remote control work without the internet being present at the shop.
6. **Remote kill / wipe** — super-admin marks a device blocked or a client paused; the next online contact revokes the license and clears the local database.

Honest limitation: an app that never contacts the server again cannot be remotely controlled. The workable model is a grace window — full offline operation for 7–30 days (super-admin configurable), and one successful contact required inside that window to renew.

## 7. Suggested sequence

```text
Step 1  Device binding + signed offline license + super-admin device limit / kill switch
Step 2  Offline auth vault (PIN/biometric) + full local mirror of remaining tables
Step 3  Two-way delta sync with conflict log
Step 4  GST e-invoice + recipe costing + CSV import
Step 5  Loyalty, attendance, wastage, franchise dashboard
```

Confirm which step to build first and I will produce a detailed implementation plan for it.
