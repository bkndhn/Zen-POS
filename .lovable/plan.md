# QR Feedback Module — Plan

A new **Feedback** tab inside the existing QR Code page (menu stays untouched as its own tab), a public QR-only feedback form per branch, custom form builder, submissions stored per client/branch, a Feedback tab in CRM with WhatsApp reply, and a super-admin toggle so it can be sold as a paid add-on.

---

## 1. Database (Supabase)

New tables — all RLS-isolated by `admin_id` + `branch_id`, granted to `authenticated` + `service_role`. Public reads via SECURITY DEFINER RPCs only.

**`feedback_forms`** (one active config per branch)
- `admin_id`, `branch_id`, `slug` (unique, branch-scoped, used in QR URL)
- `title`, `subtitle`, `thank_you_message`
- `show_shop_header` (bool), `header_logo_url` override
- Theme: `primary_color`, `background_color`, `text_color`, `font_family`, `border_radius`, `layout_style`
- `is_active`, `cooldown_days` (default 30)
- `submit_button_label`

**`feedback_form_fields`** (custom fields, ordered)
- `form_id`, `admin_id`, `branch_id`
- `field_key` (slug, unique per form), `label`, `placeholder`, `helper_text`
- `field_type`: `text | long_text | number | date | dropdown | radio | checkbox | rating (1-5 stars) | email | phone | yes_no`
- `options` (jsonb — for dropdown/radio/checkbox)
- `is_required`, `display_order`
- `validation` (jsonb — min/max, regex, min_length, max_length)
- `is_active` (soft delete)

**`feedback_submissions`**
- `admin_id`, `branch_id`, `form_id`
- `customer_mobile` (indexed, used for 30-day cooldown), `customer_name` (optional if field present)
- `responses` (jsonb — `{ field_key: value }`)
- `overall_rating` (numeric, derived from a rating field if present — for CRM sorting)
- `ip_hash`, `session_id`, `user_agent` (rate-limiting/abuse)
- `status`: `new | reviewed | replied | resolved | ignored`
- `reply_notes`, `replied_at`, `replied_by`
- `submitted_at`

**`profiles.client_permissions`** — add `allow_feedback_module` (bool). Super-admin toggles per client. When false, Feedback tab, CRM Feedback tab, and public feedback URL are all blocked.

**RPCs (SECURITY DEFINER, fixed search_path):**
- `get_public_feedback_form(p_slug text)` → returns form + active fields + branch shop header (only if `allow_feedback_module` true and `is_active` true).
- `submit_feedback(p_slug text, p_mobile text, p_responses jsonb, p_session_id text)` → validates cooldown (same mobile + branch within `cooldown_days`), rate-limits per session/IP (reuse pattern from `check_service_request_rate_limit`), inserts submission. Returns `{ok, reason}`.
- `resolve_feedback_slug(p_slug)` → admin_id + branch_id for public route.

**Realtime:** enable on `feedback_submissions` so CRM tab updates live.

---

## 2. Admin UI

### QR Code page (`src/pages/QRMenu.tsx`)
Convert current single view into a **tabbed layout**: `Menu QR` (existing, untouched) | `Feedback QR` (new). Both branch-scoped via existing `useBranch`.

### Feedback tab contents (new component `FeedbackQRSettings.tsx`)
- **Permission gate:** if `allow_feedback_module` is false → show locked state with "Contact admin to enable Feedback module" CTA (mirrors existing premium-lock pattern).
- **QR generator:** generates URL `{origin}/feedback/{branch_slug}` — download PNG, copy link, poster download (reuse `QRPosterStudio` pattern).
- **Form settings:** title, subtitle, thank-you message, cooldown days, submit button label, toggle shop header.
- **Theme editor:** color pickers, font family (reuse Menu Design Studio font list), border radius, layout style; live preview iframe.
- **Field builder (`FeedbackFieldBuilder.tsx`):**
  - Add field → pick type → set label/placeholder/helper/required/options/validation.
  - Reorder via drag-and-drop (dnd-kit already common) with up/down fallback buttons for mobile.
  - Inline edit + soft delete + toggle required.
  - Live preview of the rendered form.

### CRM page (`src/pages/CRM.tsx`)
Add tabs: **Customers** (existing) | **Menu Orders** (existing content if any) | **Feedback** (new).

**Feedback tab (`CRMFeedbackTab.tsx`):**
- Table: submitted_at, branch, customer_mobile, customer_name, overall_rating, key responses (first 2 columns), status.
- Filters: branch, date range, status, min rating, search by mobile/text.
- Row click → detail drawer with all responses, status changer, reply notes.
- **WhatsApp Reply:** deep link `https://wa.me/91{mobile}?text={template}` with reply template ("Hi {name}, thanks for your feedback at {shop}. About '{issue}' — {reply_notes}"). Marks status `replied` on click.
- **Export:** reuse `exportUtils.ts` CSV path. Columns = all custom fields (dynamic union across submissions) + metadata + status + reply. One CSV per current filter/branch.
- Combined view (all branches for admin) + branch-filtered view.

---

## 3. Public Feedback Page (`src/pages/PublicFeedback.tsx`)

Route: `/feedback/:slug` — QR-only access enforcement:
- On mount, check `document.referrer` empty **and** a `?src=qr` param (added to QR URL). Reject direct-link/typed access with a "Please scan the QR code at the store" screen. (Not perfectly bulletproof but matches user intent; combined with cooldown + rate-limit it's robust.)
- Fetches form via `get_public_feedback_form` RPC (anonymous).
- Renders shop header (if enabled) with logo/name/address from branch scoped shop settings.
- Dynamic form renderer for each field type with client-side validation (Zod schema built from field config).
- Requires mobile number (10-digit India regex — reuse existing validator).
- Submit → `submit_feedback` RPC. On cooldown block → "You've already shared feedback recently. Thanks!" screen. On success → animated thank-you screen with configured message.
- Sanitize all text inputs (DOMPurify already in project) before render/store.
- Rate limit: max 3 submissions per session per hour + 1 per mobile per `cooldown_days` per branch.

---

## 4. Super Admin

In `SuperAdminUsers.tsx` client permissions section — add **"Feedback Module"** toggle alongside existing `allow_qr_menu` toggle. Bulk enable/disable supported. This is the paywall for selling Feedback as a separate income stream.

---

## 5. Essential extras (added proactively)

- **Analytics widget** on Feedback tab: total submissions this month, avg rating, response rate (replied/total), top complaint keywords (simple client-side word frequency, no AI cost).
- **Auto-status:** submissions with rating ≤ 2 auto-flagged `needs_attention` in red.
- **Unread badge** on CRM Feedback tab (count of `status='new'`).
- **Duplicate detection:** same mobile + same responses within 24h → silently deduped.
- **QR poster templates** for Feedback (reuse QRPosterStudio pattern) — "Share your experience" tent card.
- **Template WhatsApp replies:** 3-4 preset messages (thank/apology/discount offer) editable in Feedback settings.
- **Field templates:** one-click "Restaurant starter pack" (rating, food quality, service, cleanliness, suggestions) so new clients skip building from scratch.

---

## 6. Files touched

**New:**
- `src/pages/PublicFeedback.tsx`
- `src/components/FeedbackQRSettings.tsx`
- `src/components/FeedbackFieldBuilder.tsx`
- `src/components/CRMFeedbackTab.tsx`
- `src/hooks/useFeedbackForm.ts`
- `src/utils/feedbackExport.ts`
- Migration: tables + RPCs + realtime publication + grants + RLS

**Modified:**
- `src/pages/QRMenu.tsx` — tabbed Menu/Feedback wrapper
- `src/pages/CRM.tsx` — add Feedback tab
- `src/pages/SuperAdminUsers.tsx` — add `allow_feedback_module` toggle
- `src/App.tsx` — public `/feedback/:slug` route (outside auth)
- `src/config/navItems.ts` — no change (Feedback lives inside QR page)

---

## 7. Isolation & security summary

- All tables scoped by `admin_id` + `branch_id`, RLS enforced.
- Public routes hit SECURITY DEFINER RPCs only — no direct table access for `anon`.
- Cooldown enforced server-side (mobile + branch + days).
- Rate limits mirror existing `check_service_request_rate_limit` pattern.
- Feature gated by `client_permissions.allow_feedback_module` — checked in RPC **and** UI.
- Input sanitization (DOMPurify) on all rendered custom field responses.

---

## 8. Monetization hook

Because it's gated by a per-client super-admin toggle, you can sell Feedback + CRM Feedback tab as a standalone add-on (e.g. ₹199–₹299/branch/month) without touching core POS pricing. Suggested: track adoption via existing `rum_events` to justify the upsell.

---

Confirm and I'll build in this order: migration → super-admin toggle → public form + RPCs → admin form builder → CRM feedback tab → WhatsApp reply + export.