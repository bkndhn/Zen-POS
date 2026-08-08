# Payments: Super Admin Collection, Receipts, Reconciliation & Sandbox

## Why you can't see the setup today
The Payment Gateway card does exist in Settings, Integrations tab, but it hides itself when the logged-in account has no admin id. A super admin account has no admin id, so the card renders as nothing. That is why the page looks empty for you.

## How it will work after this change

Two completely separate, isolated gateway configurations:

```text
Super Admin (platform)  -> collects SUBSCRIPTION money from clients
   own Razorpay/PhonePe keys, own webhook URL

Each Client (admin)     -> collects CUSTOMER order money
   own Razorpay/PhonePe keys, own webhook URL, isolated per admin/branch
```

Nothing is shared between them. Keys stay server-side only; the browser never receives a secret.

## What gets built

### 1. Super Admin payment setup (new "Payments" tab)
- New tab in the Super Admin page to enter platform Razorpay / PhonePe credentials (test and live kept side by side).
- Copyable webhook URL for the platform account plus a "verify connection" button.
- Subscription collection (Pay Online, Auto-Pay) resolves the platform credentials instead of the client's.
- Client-side gateway card in Settings stays as-is for customer collections, and stops rendering blank for super admins (it will show a short note pointing to the Super Admin Payments tab).

### 2. Subscription receipts and payment history screen
- New in-app screen listing every subscription charge: date, plan, amount, provider (Razorpay/PhonePe), method (UPI/card), status (paid, pending, failed, refunded), transaction/UTR reference.
- Each row opens a printable invoice-style receipt with shop details, GST fields if configured, and plan period covered.
- Super Admin gets the same list across all clients with filters by client, status, and date range.

### 3. Webhook retry, idempotency and reconciliation
- Every incoming webhook is stored once, keyed by provider event id, so a repeated delivery can never charge or credit twice.
- Failed processing is queued and retried with backoff instead of being lost.
- A scheduled reconciliation job re-queries the provider for any transaction stuck in pending beyond a threshold and corrects the subscription status automatically.
- Manual "Reconcile now" action in the Super Admin payments screen.

### 4. Auto-pay cadence controls
- Customers choose monthly or annual cadence and see the next billing date before authorising.
- In-app controls to pause, resume, change cadence, change amount tier, or cancel the mandate.
- Status card shows mandate state, last charge, next charge, and any provider-side failure reason.

### 5. Guest WhatsApp ordering with payment links
- Order confirmation generates a shareable link carrying order context (order number, table/seat, items summary, amount).
- Sending via WhatsApp keeps the existing wa.me/Cloud API modes.
- When the payment webhook confirms success, the live order tracker flips to Paid in real time without a refresh, and the kitchen/service views see the paid flag.

### 6. Sandbox / test mode
- Test vs Live switch per gateway config, with a visible badge everywhere payments appear so nobody confuses environments.
- Built-in simulator to fire a success, failure, and duplicate webhook against your own endpoint and confirm the resulting subscription state.
- A checklist panel showing: credentials saved, webhook reachable, signature verified, test payment settled.

## Technical notes
- New tables: `payment_platform_credentials` (super-admin only, RLS restricted to super admin), `payment_webhook_events` (event id unique, status, attempt count, payload) for idempotency and retry.
- Extend `payment_transactions` with `invoice_no`, `environment`, `reconciled_at`; extend `payment_mandates` with `cadence` and `paused_at`.
- `_shared/pg.ts` gains a platform-credential resolver so subscription flows never read client credentials.
- Webhook function becomes: verify signature, insert event (unique), ack immediately, then process; retries handled by a scheduled function via pg_cron.
- Reconciliation uses provider fetch APIs (Razorpay payments/subscriptions, PhonePe status API) rather than trusting webhooks alone.
- Realtime channel on `remote_orders` payment status drives the live tracker update.

## Order of work
1. Super Admin payments tab + platform credentials + fix blank card (unblocks everything).
2. Webhook idempotency, retry queue, reconciliation.
3. Receipts and payment history screens.
4. Auto-pay cadence controls.
5. Guest WhatsApp payment links + live tracker sync.
6. Sandbox testing mode and checklist.
