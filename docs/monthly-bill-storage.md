# Monthly bill storage: preparation status

## What is deployed

Empty, monthly-partitioned `bills_archive` and `bill_items_archive` parent tables are ready. Initial months cover the previous 12 months through two months ahead. No live bills or items were copied, removed, or redirected. No archive mover, combined history view, or archive schedule is enabled.

Archive client access is read-only through the parents, with tenant, branch, and existing Reports PIN checks. Super Admin is explicitly excluded. Child partitions have no client grants and deny direct client access. Maintenance functions are service-role-only and use a fixed search path.

The server-only `preview_bill_archive(month)` returns counts for one month: old bills, fully paid/completed candidates, candidates blocked by linked records, and unlinked candidates. It does not return bill or customer details and is not a promise that candidates can already be moved safely. `prepare_bill_archive_month(month)` creates empty month partitions only; there is no scheduled invocation.

Eligibility is conservative: older than 60 days (not exactly 60), payment status `paid`, due amount exactly zero, kitchen status `completed`, and service status `completed`. Unknown states are excluded. Linked tables, table orders, security alerts, customer ledgers, and Khata references block the preview candidates. Bill-item references are preserved in the future move design, not discarded.

## How clients see previous months today

Use the existing Reports date range; all bills remain in the current tables. There is no change to receipts, exports, CRM, editing, stock, or offline replay. Archive reads are not yet connected to these pages because no history has moved.

## Why automatic moves are not enabled

Existing foreign keys can prevent bill deletion or clear ledger links. Current reporting queries and item joins still use live tables. Original-number replay and overall bill numbering also need to find historical sales. A `UNION ALL` view alone does not preserve all these behaviours.

Before any movement: implement durable references and a complete history interface, preserve authorized edits/voids and original-number idempotency, run authenticated history and checkout checks, verify restore readiness, then agree a quiet maintenance period. Future moves require bounded atomic batches, exact-content comparisons, overlap protection, timeouts, and rollback tests.

## Capacity and trade-offs

This preparation does not reduce live table sizes or establish a throughput improvement. Monthly partitions can help maintenance and month-specific queries once migration is complete, but introduce backup, relationship, monitoring, and recovery work. Neither 2,000 outlets nor 1 lakh clients are guaranteed; representative load testing and infrastructure sizing remain required.

## Verification

- Database assertions verified the 60-day boundary, payment, due amount, active kitchen/service exclusions, and unknown-state exclusion.
- Catalog checks verified all 30 initial child partitions have RLS policies and no anonymous/authenticated direct read grants.
- Live public access tests cover archive tables and maintenance functions.
- Authenticated tenant/branch/PIN and historical receipt flows remain unverified for this external unmanaged Supabase project. They gate activation, not existing billing.