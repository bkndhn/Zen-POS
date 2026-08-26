# ZenPOS Capacity & Market Launch Report (Suggestions Only)

## 1. How many clients & public users can the app handle?

### Free Vercel + Free Supabase (current setup)

| Resource | Free limit | Practical capacity for ZenPOS |
|---|---|---|
| Supabase database | 500 MB | ~40–60 restaurant clients (bills + items + images metadata) before DB pressure |
| Supabase storage | 1 GB | ~15–25 clients if every menu item has a photo (100–300 KB each); ~50+ with compressed WebP |
| Supabase bandwidth | 5 GB/month (egress) | ~30–50k public-menu page loads/month; heavy image menus burn this fast |
| Supabase realtime | 200 concurrent connections | ~40–60 outlets with 3–4 devices each (billing + KDS + service) simultaneously online |
| Auth MAU | 50,000 | Not a constraint — POS staff counts are tiny |
| Edge functions | 500k invocations/month | Comfortable for backups, payments, AI insights at pilot scale |
| Auto-pause | Pauses after 7 days of inactivity | Real clients keep it warm; still add an external cron ping (UptimeRobot) as insurance |
| Vercel free (Hobby) | 100 GB bandwidth, 100 GB-hrs serverless | Effectively unlimited for a SPA — the app is static; Vercel only serves JS/CSS/images |

**Realistic answer (free Vercel + free Supabase):**
- **30–50 paying restaurant clients** comfortably.
- **~150–200 concurrent staff devices** across all clients.
- **~30,000–50,000 public-menu visitors/month** (guest QR ordering) before egress becomes the bottleneck.
- Peak "ultra fast" performance holds as long as realtime connections stay under ~150 and DB stays under ~400 MB. The app's React Query caching, IndexedDB/SQLite offline layer, and edge-cached images already do the heavy lifting for speed.

**Bottleneck order:** (1) Supabase bandwidth → (2) realtime connections → (3) DB size → (4) storage. Vercel is never the bottleneck.

### Free Supabase + Hostinger/GoDaddy

| Scenario | Frontend hosting | Capacity vs Vercel-free |
|---|---|---|
| Domain only (no hosting), DNS → Vercel | Vercel free serves the app | Identical to above — a custom domain costs nothing in capacity |
| Hostinger shared hosting (~₹150–300/mo) hosting the static build | Hostinger serves JS/CSS/images | Slightly better bandwidth headroom than Vercel free, but slower global delivery (no edge CDN), manual deploys via FTP/CI, no preview URLs. Not recommended unless you outgrow Vercel's 100 GB |
| GoDaddy hosting | Similar shared hosting | Same trade-offs as Hostinger; GoDaddy shared hosting is typically slower. Use GoDaddy only to buy the domain, point DNS to Vercel |

**Recommendation:** Buy the domain from whoever is cheapest (GoDaddy/Hostinger/Cloudflare), keep hosting on Vercel free, and spend the first rupee on **Supabase Pro (₹~2,100/mo)** when you cross ~40 clients — that is the single lever that 10x's capacity (8 GB DB, 100 GB bandwidth, 500 concurrent realtime, no auto-pause).

## 2. Scaling ladder (when to upgrade)

```text
0–40 clients     → Free Vercel + Free Supabase + cron keep-alive ping
40–150 clients   → Supabase Pro (~$25/mo), Vercel free
150–500 clients  → Supabase Pro + Vercel Pro ($20/mo) + image CDN (Cloudflare free)
500+ clients     → Supabase compute add-on + read replicas + per-client storage quotas (already built)
```

## 3. Current flow — what already supports scale

- React Query persistent caching + IndexedDB/SQLite offline-first — instant repeat loads, works through internet drops.
- Station-routed printing, offline bill queue, encrypted backups.
- Per-admin storage quotas + lifecycle purge tools already built.
- Server-side pg_cron backups — no dependency on the app being open.
- Public menu rate limiting + session-scoped guest RPCs.
- RLS tenant isolation with audited security findings fixed.

## 4. What to add/enhance before market launch (priority order)

### Must-do (cheap, high impact)
1. **Keep-alive cron** — UptimeRobot or Cloudflare Worker hitting `/api/health.js` and a lightweight Supabase RPC every 5 minutes; prevents auto-pause and cold starts.
2. **Image compression on upload** — enforce WebP ≤ 150 KB per menu image; doubles free-tier storage/bandwidth headroom.
3. **Cloudflare free CDN in front of public menu images** — moves image egress off Supabase's 5 GB budget entirely.
4. **Realtime connection hygiene audit** — ensure each device opens only the channels it needs; KDS doesn't need payments channel, etc. This is the #1 lever for fitting more outlets under the 200-connection cap.
5. **Uptime + error monitoring dashboard** — Sentry already integrated; add a public status page for client trust.

### Should-do (before charging money)
6. **GST e-invoice readiness / invoice format sign-off** by 2–3 local accountants.
7. **Payment gateway live-mode verification** (Razorpay/PhonePe webhooks + reconciliation).
8. **Day-end / shift-close Z-report** — cashiers expect this on day one.
9. **Onboarding kit** — Tamil + English training video, sample CSV item import, printer pairing checklist.
10. **Real-device print QA** — 5+ different 58/80mm Bluetooth printers, low-end Android phones.

### Nice-to-have (revenue features, Wave 2)
11. Recipe/BOM costing, loyalty wallet, Swiggy/Zomato sync, UPI QR on receipts, franchise multi-brand reporting.

## 5. Launch recommendation

```text
Phase 1 (weeks 1–4):   3–5 friendly restaurants, free pilot, stay 100% on free tiers.
Phase 2 (weeks 5–8):   Fix field issues (printing, offline), finalize onboarding kit.
Phase 3 (weeks 9–12):  Open paid subscriptions at ₹799–₹999/mo or ₹3,999/yr launch offer;
                       move to Supabase Pro at ~40 clients or when egress crosses 4 GB/mo.
```

**Bottom line:** Free Vercel + free Supabase genuinely supports a 30–50 client launch. Do not pay for Hostinger/GoDaddy hosting — buy only the domain there. The first paid upgrade should be Supabase Pro, funded by your first 3–4 subscriptions.

*This is a suggestions-only report — no code changes included. Approve only if you want any of the "Must-do" items implemented.*
