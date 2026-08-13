# Feature Roadmap: Next 4 Phases

A phased build plan for the highest-revenue gaps. Each phase ships independently and keeps all existing functionality untouched. Every new table is admin/branch isolated with RLS + explicit grants, matching the current tenancy model.

## Phase 1 — Recipe/BOM Costing + Order-Time Modifiers

Why first: it makes stock numbers finally true for food businesses and unlocks food-cost reporting, using inventory data you already store.

- Recipe builder on each item: ingredient item, quantity, inventory unit, wastage %.
- On bill save, deduct ingredient stock instead of (or alongside) the finished item.
- Food-cost % and margin per item, shown in Items and in Analytics.
- Modifiers/variants at order time: groups (e.g. Spice level, Add-ons), single/multi select, price deltas, mandatory flags.
- Modifier text flows into cart, KOT/BOT ticket, bill print, KDS card.
- Combos and time-based pricing (happy hour) as an optional toggle.

## Phase 2 — GST / Compliance Pack

Why: this is the most common blocker for shops with GSTIN who compare against Petpooja/Vyapar.

- B2B invoice mode: buyer name, GSTIN, place of supply, reverse charge, HSN/SAC per item.
- Credit and debit notes linked to original bills, with their own numbering series.
- Day-close / Z-report: expected vs declared cash, shift handover, variance log.
- Immutable audit log for price edits, discounts, voids, deleted bills — exportable.
- GSTR-1 / GSTR-3B summary export (CSV) and a Tally-compatible export.
- E-invoice IRN/QR is prepared for but gated behind a provider credential setting (needs an IRP/GSP account before it can be live).

## Phase 3 — Retail Pack (widens the buyer base beyond restaurants)

- Barcode scan-to-cart in Billing (camera + USB/Bluetooth HID scanner), using the existing `barcode` column.
- Barcode/price label printing to the connected thermal printer.
- Batch and expiry alerts, near-expiry markdown suggestions (builds on `item_batches`).
- Reorder point per item with auto purchase-order draft to the mapped supplier.
- Supplier price history and landed cost on purchases.

## Phase 4 — Loyalty, Khata Ledger & Payment Depth

- Loyalty points/wallet with earn and redeem rules per branch; coupons and referral codes.
- Full khata (credit) ledger: running balance per customer, aging buckets, WhatsApp reminders with a payment link (reuses the existing payment-link edge function).
- Split bill by seat or by person, merge tables, partial payments, tips.
- Refund/void workflow with approval PIN and full audit trail.

## Deferred (planned, not in these phases)

- Swiggy/Zomato/ONDC connectors — needs partner API credentials from each aggregator.
- WhatsApp Business Cloud API — needs a Meta business account and template approval.
- iOS printing path — needs an Apple developer account and a native build target.
- Staff attendance, commission, and franchise master-menu push.

## Technical Notes

- New tables per phase: `item_recipes`, `modifier_groups`, `modifier_options`, `bill_item_modifiers` (P1); `b2b_invoice_details`, `credit_notes`, `day_close_sessions`, `audit_log` (P2); `reorder_rules`, `purchase_orders` (P3); `loyalty_accounts`, `loyalty_transactions`, `khata_ledger`, `coupons` (P4).
- All follow the existing pattern: create table, GRANT to `authenticated`/`service_role`, enable RLS, owner/branch-scoped policies via the existing helper functions.
- Stock deduction for recipes goes inside the existing `secure_create_bill` RPC so offline sync and retries stay idempotent.
- Money and quantity output continues through `src/utils/formatters.ts` for 2-decimal precision, and quantities respect `inventory_unit` for kg/L vs g/ml.
- Printing changes route through the existing `kotGenerator` and `bluetoothPrinter` modules so station routing and paper-save mode keep working.
- Offline: new writes register with `src/utils/syncEngine.ts` so they queue and sync like bills do.

## Suggested Order

Phase 1 first (biggest daily-use impact), then Phase 2 (unblocks GST-registered buyers), then Phase 3 (new market segment), then Phase 4 (retention and upsell). I will build one phase at a time and stop for your review after each.
