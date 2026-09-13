# Native sync, expiry, onboarding, and printing hardening

## Goal
Make the Capacitor app drain pending changes automatically, keep the exact seven-day verification lock, and use real thermal printing for receipts, KOTs, and Z-reports without changing the working PWA flow.

## Implementation
1. Replace the native queue’s stop-after-failure behavior with a continuous background coordinator that retries automatically with bounded backoff, resumes on app foreground/network recovery, and drains both bill and general write queues until empty.
2. Fix queue accounting and claim recovery so failed or interrupted native writes remain visible and retryable, but successful rows disappear immediately.
3. Keep PWA synchronization on IndexedDB and native synchronization on encrypted SQLite, while exposing one consistent status instead of competing manual sync paths.
4. Add an ESC/POS Z-report generator and route Z-report printing through the existing native Bluetooth bridge; retain browser printing only for web/PWA fallback.
5. Preserve receipt and station-specific KOT printing through the native bridge, including saved-printer reconnect and queued print retry.
6. Validate the seven-day lock boundary with automated tests and build an offline Capacitor bundle/APK locally where the environment permits.
7. Inspect existing outlet records and onboarding readiness. Do not create or change a real client without service-role access and explicit credentials.

## Validation
- Run targeted sync, identity, license, and authorization tests.
- Build the offline web bundle, sync Android, and run the Android debug APK build.
- Verify native plugin registration and generated APK artifacts.
- Report what is code-verified versus what still requires installation on the physical phone.

## Technical details
- Retry permanently without busy-looping: immediate drain while progress is made, then exponential backoff with jitter for transport/server failures.
- Trigger native sync on startup, browser online events, visibility changes, and Capacitor `appStateChange`/network changes.
- Keep unrecoverable validation/RLS failures visible in diagnostics instead of repeatedly hammering Supabase.
- Keep the lock anchored to the last successful server verification and lock at exactly seven elapsed days while preserving local data.
