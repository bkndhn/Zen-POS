
This is a large, multi-area enhancement. To keep it safe and shippable without breaking existing flows, I'll split it into 5 phases and ship them in separate turns. Please confirm the phase order (or pick a subset) before I start writing code.

## Phase 1 — Menu design consolidation (low risk, quick win)
- Remove the duplicate **Menu Appearance** block from `QRCodeSettings.tsx` (screenshot 1).
- Make **Menu Design Studio** (`MenuDesignStudio.tsx`) the single source of truth for header/pill/background/text colors, layout, and Items Per Row.
- Migrate any legacy `menu_appearance_*` fields on `shop_settings` into the design-studio fields on first load (read-fallback, no destructive migration).
- `PublicMenu.tsx` reads only from the studio fields; existing customer-portal look preserved.

## Phase 2 — CRM upgrades
- Sort CRM customers by **latest bill first** (order by `max(bills.created_at)`).
- Add **View (eye)** button → dialog listing that customer's bills with items.
- Add **Reorder** button → navigates to `/billing` with a preloaded cart; unavailable/inactive items shown in a "couldn't add" toast + inline banner.

## Phase 3 — QR Poster Studio
- New `QRPosterStudio` component on `/qr-menu`:
  - 10 built-in poster templates (Scan to Order, Table Tent, Minimal, Neon, Retro, Festive, Luxe Gold, Kids, Coffee, Bakery) + **Custom** template.
  - Live preview; customize title / subtitle / footer / colors / font / QR style / logo / background image.
  - Export **PNG / JPG** via `html2canvas`, **PDF** via `window.print()` route, **SVG** via inline SVG renderer.
  - "Set as default" stored in `shop_settings.qr_poster_config` (jsonb).
- Existing QR download & share buttons untouched.

## Phase 4 — Voice billing (mic in Billing search bar)
- Mic button in `Billing.tsx` search input; uses browser `SpeechRecognition` with lang toggle (`en-IN`, `ta-IN`, `hi-IN`).
- Parser pipeline:
  1. Local rule-based parser (regex: qty + unit + name in either order, EN/TA numerals).
  2. Fallback to **Lovable AI Gateway** (`google/gemini-3-flash-preview`) via a new Supabase edge function `voice-parse` that takes `{ transcript, items[], lang }` and returns `{ intent, itemId?, qty, unit, variant?, ambiguous?, candidates[] }`.
- Actions supported: add item (auto-add if 1 match, else show candidate chips), `pay`, `upi ₹X` / `cash ₹X` / `card`, `dine in`/`parcel`, `discount X`, `mobile 9xxxxxxxxx`, `complete payment`.
- Fully additive — typing/tap flow unchanged. Falls back cleanly if mic/AI unavailable.

## Phase 5 — UPI end-to-end QA + perf pass
- Playwright script that walks: customer portal → add items → UPI pay → simulate success + failure + retry → verify receipt in `bills` table.
- Perf: memoize heavy CRM/Reports lists, add `react-query` staleTime tuning where already used, lazy-load `MenuDesignStudio` and new `QRPosterStudio`. No business-logic changes.

## Technical notes
- New table columns (single migration): `shop_settings.qr_poster_config jsonb`, `shop_settings.menu_design_source text default 'studio'`.
- New edge function: `voice-parse` (LOVABLE_API_KEY, gemini-3-flash-preview).
- No breaking changes to existing RLS, RPCs, or bill schema.

**Please reply with:**
1. Ship all 5 phases in order? Or pick a subset / reorder?
2. For voice, OK to use browser SpeechRecognition (Chrome/Edge/Android)? iOS Safari will fall back to a "type instead" prompt.
