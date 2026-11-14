# Step 2: Monthly bill storage without breaking checkout

## Verified current state
- No archive tables or archive procedure have been deployed yet.
- Old bills are still available through the app's existing Reports date filters.
- Bills have dependent table orders, table links, security alerts, customer ledgers, and Khata transactions. Deleting an old bill can fail or clear ledger references; deleting its items can also affect receipt reprints.
- Historical Reports, Analytics, CRM, exports, and bill editing currently use the live tables. Adding a combined view alone does not update these workflows.

The earlier description of hot/cold archiving as a simple, non-breaking change was incomplete. Do not run an automatic move or deletion against these tables now.

## Build in three controlled stages

### 1. Prepare monthly storage — no live data removal
- Create monthly historical bill and bill-item storage with explicit access grants and tenant-isolated, read-only client access.
- Preserve branch permissions and Reports PIN requirements. Exclude Super Admin from all operational archive data.
- Add an administrator-only maintenance preview that reports candidate counts and blocking dependencies, without returning customer information or changing records.
- Keep automatic scheduling disabled and all existing checkout, stock, printing, and offline replay paths unchanged.

### 2. Make historical access complete before moving records
- Define and implement a durable bill-identity reference strategy for table orders, alerts, customer credit, and Khata links. Never clear these links just to permit deletion.
- Connect all historical report, analytics, CRM, export, receipt, and bill lookup paths to a single history interface with appropriate item relationships and pagination.
- Preserve bill-number checks and original-number offline replay across active and historical data, so retrying an old sale cannot create another bill or deduct stock again.
- Define controlled historical edit/void behaviour with the same authorization, stock, audit, and receipt rules as current bills; never silently make old bills uneditable.
- Clients continue selecting past months in the app; no separate archive login or download-only reporting.

### 3. Enable small verified moves during an agreed quiet period
- Move only completed, settled bills older than 60 days; skip active service, unpaid bills, and any unresolved linked records.
- Use short, bounded transactions, lock timeouts, a maintenance kill switch, and overlap protection.
- Verify exact bill and item contents before deleting any active copy. Keep a rollback path and an audit of each batch.
- Demonstrate historical read/reprint, credit links, checkout, stock deduction, and offline retry before enabling a schedule.
- Do not schedule a production move until the quiet period and restore readiness are confirmed.

## Verification gates and current limitations
- Add tests for age eligibility, unpaid/active-service exclusion, tenant/branch/PIN access, duplicate retry protection, and rollback on mismatched copies.
- Verify historic receipts and reports through signed-in shop flows before activation. Automated signed-in testing is unavailable for this project's external Supabase connection, so this gate needs a supervised shop session or a separate authenticated test environment.
- Load-test representative billing, kitchen, reporting, and notification traffic before making any outlet-capacity claim.

## Benefits, trade-offs, and capacity
- Monthly storage can make historical maintenance and date-limited searches more manageable after the app is fully connected to it.
- It adds operational complexity: partitions, backups, historical relationships, edit paths, and failed-move recovery all need maintenance.
- Keeping duplicate snapshots without removing live records does not reduce the live tables or prove a performance gain.
- This work alone cannot guarantee 2,000 outlets, and does not establish support for 1 lakh clients. Actual capacity depends on measured peak traffic, database resources, realtime connections, support, and recovery procedures.

## Technical approach
- Use the Supabase migration tool for schema and policy changes; every new public table receives grants before RLS and policies.
- Historical reads must enforce caller identity, tenant, branch, and Reports PIN checks; views must not bypass RLS.
- Keep security-definer functions on a fixed search path and restrict maintenance execution to the server role.
- Do not replace live bill tables, change their primary keys, disable security, or detach foreign keys as a shortcut.

Approval starts Stage 1 only. Stage 3 remains gated by the historical-flow checks and a confirmed maintenance window.