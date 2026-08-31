# Backend Decision: Stay on Supabase + Free-Tier Optimization

## Decision (no migration)
Supabase remains the backend. Firebase/AWS/Azure/DigitalOcean all require weeks of rewrite (84 tables, RLS policies, RPCs, Realtime, cron) with worse cost at pilot scale. Zero migration work is planned.

## What this plan covers
A lightweight optimization + monitoring pass so the free tier stretches further and the Pro upgrade ($25/mo) happens deliberately, not by surprise.

## Steps

### 1. Database size & index audit
- Query table sizes, row counts, and unused/missing indexes across the 84 tables.
- Identify the largest tables (likely `bills`, `bill_items`, `security_audit_log`, sync/offline logs).
- Add indexes for the hot query paths (admin_id + created_at filters) and flag bloat.

### 2. Retention & pruning for log-style tables
- Add pg_cron retention jobs to auto-delete:
  - `security_audit_log` entries older than 90 days
  - resolved/offline sync queue rows older than 30 days
  - stale `public_rate_limits` entries older than 24 hours
- Keeps free-tier 500 MB database headroom healthy for the 30–50 outlet pilot.

### 3. Usage monitoring
- Add a small super-admin "Backend Health" card (database size, storage size, top tables by size, estimated free-tier headroom %).
- Threshold alerts at 70% / 85% so the Pro upgrade decision is data-driven.

### 4. Report
- Deliver a short capacity report: current usage, projected outlets supported on free tier after pruning, and the exact trigger points for upgrading to Pro.

## Technical notes
- All SQL changes go through the migration tool with proper GRANT/RLS ordering.
- Retention jobs use pg_cron (already used for scheduled backups).
- No changes to auth, billing flows, or existing features.
- No backend provider changes.
