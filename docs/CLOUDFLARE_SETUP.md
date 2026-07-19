# Cloudflare CDN + Rate Limiting Setup (Free Tier)

This app is **already coded** to use a CDN in front of Supabase Storage and
to cache QR menu pages aggressively. The remaining work is **DNS + Cloudflare
dashboard config** — it can't be done from code. Follow this once per domain.

Estimated time: **15 minutes**. Cost: **₹0** (free Cloudflare plan).

---

## Part A — Image CDN (kills 90% of Supabase egress)

### 1. Add your domain to Cloudflare (free plan)

1. Sign up at https://dash.cloudflare.com → Add a site → pick **Free** plan.
2. Change your domain's nameservers at your registrar to the two Cloudflare
   nameservers shown. Propagation takes 5–30 min.

### 2. Create a Cloudflare Worker to proxy Supabase Storage

Dashboard → Workers & Pages → Create → **Hello World** template. Paste:

```js
const SUPABASE_HOST = 'ivleyttlqlqawghvfyjz.supabase.co';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    // Everything after the CDN origin is forwarded verbatim to Supabase.
    const upstream = `https://${SUPABASE_HOST}${url.pathname}${url.search}`;

    const cache = caches.default;
    const cached = await cache.match(request);
    if (cached) return cached;

    const resp = await fetch(upstream, { cf: { cacheTtl: 2592000, cacheEverything: true } });
    if (resp.ok) {
      const cloned = new Response(resp.body, resp);
      cloned.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      cloned.headers.set('Access-Control-Allow-Origin', '*');
      await cache.put(request, cloned.clone());
      return cloned;
    }
    return resp;
  },
};
```

Deploy → Triggers → Add custom domain → `cdn.yourdomain.com`.

### 3. Point the app at the CDN

Set `VITE_CDN_URL` in Vercel → Project → Settings → Environment Variables:

```
VITE_CDN_URL=https://cdn.yourdomain.com
```

Redeploy. `src/utils/imageUtils.ts::getCDNUrl()` will now rewrite every
Supabase storage URL to your CDN host automatically. Existing DB rows do
**not** need migration — rewrite happens at render time.

**Result**: after the first request per image, Cloudflare serves from its
edge cache. Supabase egress for images drops ~95%.

---

## Part B — Rate limiting for `/menu/*` (public QR routes)

Free plan gives you **10,000 rate-limit events/month** — plenty for a POS.

Dashboard → Security → WAF → **Rate limiting rules** → Create rule:

| Field | Value |
| --- | --- |
| Name | `qr-menu-throttle` |
| If incoming requests match | `URI Path` `contains` `/menu/` |
| When rate exceeds | `60` requests per `1 minute` |
| Then | `Block` for `10 minutes` |
| Counting characteristics | `IP Address` |

Save. This blocks scrapers/loops without touching real diners (a single
customer typically hits <20 requests per menu view).

Optional second rule for the Supabase REST endpoints hit by the public menu:

| Field | Value |
| --- | --- |
| Name | `qr-menu-api-throttle` |
| If | `URI Path` `contains` `/rest/v1/items` **AND** `Referer` `contains` `/menu/` |
| Rate | `120` req / `1 min` per IP |
| Then | `Managed Challenge` |

---

## Part C — Service worker (already shipped)

`vite.config.ts` already registers a Workbox SW with:

- `NetworkFirst` for Supabase API (10s timeout, 24h cache)
- `CacheFirst` for CDN images (30-day cache, 200 entries)
- Precache for `js/css/html/ico/png/svg/woff2`

The QR menu (`/menu/:adminId`) is a normal HTML route, so it inherits
NetworkFirst navigation caching automatically. First scan hits network,
subsequent scans on the same device load instantly from the SW cache.

**Nothing to do here** — it activates on next deploy.

---

## Part D — Verify

After deploying:

1. Open the POS on a **fresh browser profile** (no cache).
2. Load `/billing` twice — second load should be instant (React Query
   IndexedDB persistence + SW precache).
3. Right-click any item image → Inspect → the URL should start with
   `https://cdn.yourdomain.com/...` not `https://ivleyttlqlqawghvfyjz...`.
4. Kill your WiFi → refresh → you should still see items + a small
   "Showing saved offline data — Retry" banner (via `OfflineDataBanner`),
   not a blank screen.
5. Cloudflare dashboard → Analytics → Traffic. Cache hit ratio should
   climb to 85%+ within a day of real traffic.

---

## Fallback: no custom domain?

If you can't move DNS to Cloudflare yet, skip Part A. The app already uses
raw Supabase public URLs with 1-year `Cache-Control`, and Supabase's own
edge caches most requests. You'll burn free-tier egress ~10× faster but
nothing breaks. Add the Worker later when you have a domain ready.
