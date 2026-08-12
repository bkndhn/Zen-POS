# ZenPOS — Build Cost From Scratch (INR): Detailed Costing Report

A document-only deliverable. No application code is touched.

## Deliverables

- `zenpos-build-cost.pdf` — print-ready A4 costing report, English, with a one-page Tamil summary at the end.
- `zenpos-build-cost.csv` — the module-wise effort and cost table in editable form.

## What the report contains

1. **Headline answer** — what it costs to rebuild this app from scratch in India: Lean, Realistic, and Agency-quoted totals, with the timeline for each.
2. **Rate card assumptions** — per-day and per-month INR rates for senior dev, mid dev, junior dev, UI/UX designer, QA, DevOps, across three sourcing options (freelancer, small studio, mid-tier agency). All later numbers trace back to this table.
3. **Module-by-module effort table** — every real module in the app, each with backend days, frontend days, QA days, and rupee cost:
   billing + KOT/BOT station routing, tables & seat-level ordering, table order billing, KDS, service area, waiter companion, QR menu, QR feedback + field builder, CRM, stock (management, adjustment, ledger, transfers, reports), purchases/returns/suppliers, expenses, reports & dashboard analytics, AI (menu import, insights, voice billing), printing stack (Bluetooth, USB, browser, native Android plugin), offline-first sync engine + local mesh, multi-branch + RLS multi-tenancy, auth/roles/permissions, licensing & subscription packs, Razorpay/PhonePe collection + webhooks/reconciliation, super admin + RUM, PWA/Capacitor packaging, landing page.
4. **Cost of the hard parts, called out separately** — the five areas that consume a disproportionate share: offline-first sync, ESC/POS printing across three transports, multi-tenant security, payment gateway with idempotent webhooks, AI integrations. Explains why each is expensive.
5. **Team and timeline models** — solo founder-dev, 3-person team, 5-person agency: person-months, calendar months, and total INR for each.
6. **Non-engineering costs** — UI/UX design, thermal printers and Android test devices, Play Store/Apple developer accounts, year-1 Supabase/Vercel/Cloudflare, payment gateway onboarding, legal/T&C/GST, project management, and a rework buffer.
7. **Three scenarios side by side** — Lean / Realistic / Agency: what each includes, what it cuts, total INR, and the risk of each.
8. **Ongoing run cost** — monthly infra + support cost at 10, 50, and 200 clients, and the resulting cost per client per month.
9. **Rebuild cost vs asset value** — what it costs to build versus what the finished product is worth to sell or license, and why the two numbers differ.
10. **Tamil summary** — the totals and the key points in plain Tamil, one page.

## Technical notes

- Effort numbers are derived from an actual read of the codebase's modules, not generic estimates.
- PDF built with ReportLab; Tamil page uses a Unicode Tamil font so glyphs shape correctly.
- Every page is rendered to an image and visually checked before delivery.
