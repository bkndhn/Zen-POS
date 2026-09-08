# Stabilise, then premium polish — screen by screen

## 1. Fix what is broken right now (first, before anything else)

The build currently reports four errors, which is why the app started misbehaving:

- Live order tracker: cancel action writes two reject-reason fields, one of which no longer exists on the order record.
- Offline layer: the queued-write merge passes a field the queue does not accept, and the operation name is passed as loose text instead of one of the three allowed values.

These are corrected in place, keeping the existing behaviour identical (cancel still records a reason, offline writes still merge instead of duplicating). Then the build log and the existing test suites (identity, authorization, smoke flow) are re-run so we can confirm the app is clean again.

## 2. Seven-day offline expiry walkthrough

Written, step-by-step description of what happens on the phone after the APK is installed:

- Day 0: first login online, verification anchor saved on the device.
- Days 1-6: full offline use, banner shows days remaining and a "Check now" button.
- Day 7 onwards: lock screen with a clear expiry message, saved data untouched, one online check restores access.

Includes exactly what to run to build and reinstall the APK, and what to tap on the phone at each stage. Building, signing, installing an APK and switching a phone offline cannot be done from here, so this is a walkthrough for you to run, not something I can execute.

## 3. Premium light polish — one screen at a time

No layout rewrites, no feature changes. Per screen, only:

- Consistent spacing rhythm and section padding
- Softer, layered shadows and one unified corner radius
- Typography scale: clearer heading/label/value hierarchy, tabular numbers for money
- Refined card, badge, table and empty-state treatment
- Calmer press/hover and loading states

All of it through the existing shared style tokens so light and dark mode both stay correct.

Order, with a check after each before moving on:

1. Billing
2. Dashboard
3. Items
4. Reports
5. Table management / KDS / service area
6. Settings and remaining screens

Each step: apply polish, confirm build is clean, confirm the screen still behaves the same.

## 4. Reports (written, no code)

- **Development cost from scratch** — audit of every module, table count, code volume, backend surface, and what an agency would charge to rebuild it, with the honest split between genuinely built and thin areas.
- **Missing features** — everything absent apart from payments and food aggregators, ranked by how much it blocks a sale.
- **Competitor comparison** — where this stands against market POS products, and which capabilities genuinely have no equivalent (true offline billing, device-bound licensing, station split printing).

## Technical notes

- Error fixes: `src/components/LiveOrderTracker.tsx` (drop the stale reject-reason field), `src/integrations/supabase/offlineLayer.ts` (widen the queue-entry update type in `StorageBackend.ts` or pass a typed merge payload, and narrow the operation literal type).
- Polish is confined to component markup and `src/index.css` / `tailwind.config.ts` tokens. No changes to hooks, sync engine, offline layer, RPCs or policies.
- Verification after each screen: build log clean, plus `authorization`, `identity-offline` and `smoke-flow` test suites.
