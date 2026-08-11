# Convince the Shop Owner — Sales Pitch (Pitch Page + Printable PDF)

## Goal
Give you a ready-to-use sales kit to convince a hotel / restaurant / tea-shop /
retail shop owner to adopt Hotel Zen POS. Two deliverables from one set of
content, fully bilingual (English + Tamil):

1. An interactive **pitch page** at a public route (`/pitch`) you open on your
   phone during the meeting.
2. A **printable PDF** (via `window.print()`) of the same content, plus a
   **sales script + objection-handling cheat sheet**.

Content balances all four persuasion pillars the user asked for equally:
Save money / ROI, Easy + supportive, Trust / safety / status.

## What we build

### 1. Public pitch page — `src/pages/SellPitch.tsx` (new route `/pitch`)
Mobile-first, matches existing brand tokens and logo. Layout:

- **Hero** — headline + subline in EN/TA, app name, tagline, "Start a free demo" CTA.
- **Language toggle** — English / Tamil tabs switching all copy (shared
  translations file).
- **"What you lose today" (Problem)** — pain points owners feel: billing
  errors, stock theft/leakage, no P&L visibility, lost customer data, slow
  manual KOT.
- **"One app fixes it" (Solution + features)** — grouped feature grid tied to
  each pain:
  - Instant billing + 2-decimal money/unit accuracy
  - KOT/BOT routing to kitchen, bar, dessert printers separately
  - Stock/inventory with correct units (g, kg, ml, L) + reorder alerts
  - Tables + seat-level ordering
  - QR menu + QR feedback (CRM) — capture customers
  - WhatsApp ordering + payment links
  - Expenses, P&L, branch-wise analytics
  - Offline-first (works without internet, auto-syncs)
  - Multi-branch isolation
- **ROI calculator block** — simple inputs (avg daily billing, estimated stock
  leakage %) → monthly/yearly savings in INR.
- **Pricing** — tier cards (Starter / Growth / Enterprise) + setup fee, in INR.
- **Trust & safety** — data isolated per outlet, secure login, encrypted
  backups, license protection, "your data stays yours".
- **Objection-handling** — compact Q&A: "too costly", "no internet", "staff
  can't learn", "why monthly", "is my data safe".
- **Call to action** — demo / WhatsApp / phone, plus QR of the app.

### 2. Printable PDF version
Same content rendered in a **print-only layout** (CSS `@media print`) so the
owner can keep a copy. Accessible via a "Print / Download PDF" button on the
pitch page and reachable directly.

### 3. Sales script + objection cheat sheet (bilingual)
A short text block (also printable) — the actual spoken pitch in EN/TA and
word-for-word answers to common objections.

## Where content lives
- `src/data/pitchContent.ts` — all copy (EN + TA) in one file.
- Route added in the app's router. Pitch page is **excluded from the POS
  sidebar** (like the existing `/display` customer view) so it stays a pure
  sales surface.
- A nav entry / link to `/pitch` so you can reach it quickly from settings.

## Technical notes
- Reuse existing design tokens (`text-success`, `fadeInUp`, card styles) and
  the existing `public/logo.png` — no new colors/fonts invented.
- Numbers in the ROI calculator and pricing are the ones already used in the
  app's pricing model (₹699/mo Starter etc.) — no invented figures.
- Bilingual text: Tamil strings kept side by side with English in the same
  data file; tab toggle switches language.
- PDF uses `window.print()` per existing app convention (no jsPDF).

## Deliverables
- `/pitch` interactive page (EN/TA) — build + live preview verified.
- Printable PDF via print button — QA'd by generating the print output and
  checking layout.
- Sales script + objections sheet (EN/TA).
