# ZenPOS

A full-featured, offline-first Point of Sale system for restaurants, cafes, and QSRs. Built with React, Capacitor, Supabase, and SQLite.

## Features

### Core POS
- **Billing** — Fast touch-based billing with barcode scanning and voice input
- **Kitchen Display (KDS)** — Real-time order queue with audio alerts and prep-time tracking
- **Table Management** — Floor plan editor with seat mapping and live table status
- **Waiter Companion** — Mobile-optimized view for tableside ordering

### Inventory & Procurement
- **Stock Management** — Batch tracking, adjustments, transfers between branches
- **Purchases** — GRN workflow with vendor management and purchase returns
- **Recipe/BOM** — Ingredient-level costing with automatic stock deduction

### Business Management
- **Reports** — Daily/monthly analytics, tax reports, item-wise profitability
- **CRM** — Customer directory with ledger (Khata) and loyalty tracking
- **Shift Management** — Z-reports, cash reconciliation, shift audit trail
- **Expenses** — Categorized expense tracking with payment mode breakdown
- **Multi-Branch** — Branch-scoped data isolation with centralized admin

### Online & Digital
- **QR Public Menu** — Shareable digital menu with remote ordering
- **Online Orders** — Order management dashboard
- **FCM Notifications** — Push notifications for orders, daily summaries

### Platform
- **Offline-First** — SQLite + IndexedDB with automatic background sync
- **Dual APK Builds** — Live Update APK (OTA) + True Offline APK
- **Bluetooth Printing** — ESC/POS thermal printer support (58mm/80mm)
- **Multi-Language** — English, Hindi, Telugu, Tamil, Kannada, Malayalam, Bengali, Marathi
- **Role-Based Access** — Page-level permissions with sub-user management
- **AI Insights** — AI-powered business analytics and menu import

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  React (Vite)                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │  Pages   │  │  Hooks   │  │  Contexts     │  │
│  │ Billing  │  │ useAuth  │  │ AuthContext   │  │
│  │ Reports  │  │ useTenant│  │ BranchContext │  │
│  │ Items    │  │ useSync  │  │ Permissions   │  │
│  └────┬─────┘  └────┬─────┘  └──────┬───────┘  │
│       │              │               │           │
│  ┌────▼──────────────▼───────────────▼───────┐  │
│  │           Offline Layer (Proxy)            │  │
│  │   Intercepts mutations → WriteQueue        │  │
│  │   Overlays pending writes on reads         │  │
│  └────────────────────┬──────────────────────┘  │
│                       │                          │
│  ┌────────────────────▼──────────────────────┐  │
│  │              Sync Engine                   │  │
│  │  Health probe → Batch drain → Retry loop   │  │
│  └────────────────────┬──────────────────────┘  │
│                       │                          │
│  ┌──────────┐  ┌──────▼──────┐  ┌────────────┐ │
│  │ SQLite   │  │  Supabase   │  │ IndexedDB  │ │
│  │ (Native) │  │  (Cloud)    │  │ (Fallback) │ │
│  │ SQLCipher│  │  PostgREST  │  │ Browser    │ │
│  └──────────┘  └─────────────┘  └────────────┘ │
└─────────────────────────────────────────────────┘
```

## Quick Start

```bash
# Prerequisites: Node.js >= 20

# 1. Clone and install
git clone https://github.com/bkndhn/Zen-POS.git
cd Zen-POS
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your Supabase project URL and anon key

# 3. Start development
npm run dev
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | ✅ | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | ✅ | Supabase anon/public key |
| `VITE_FIREBASE_*` | ❌ | Firebase config for FCM push notifications |
| `VITE_SENTRY_DSN` | ❌ | Sentry error tracking DSN |
| `VITE_HCAPTCHA_SITE_KEY` | ❌ | hCaptcha for auth spam protection |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript type checking |
| `npm run test` | Run tests |
| `npm run lint` | Run ESLint |
| `npm run build:apk:live` | Build Live Update APK (loads from Vercel) |
| `npm run build:apk:offline` | Build True Offline APK (bundled assets) |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Tailwind CSS, shadcn/ui |
| Build | Vite 7, PWA (vite-plugin-pwa) |
| Mobile | Capacitor 8 (Android/iOS) |
| Backend | Supabase (PostgreSQL, Auth, Storage, Realtime) |
| Offline Storage | SQLite (native via SQLCipher), IndexedDB (web fallback) |
| State | TanStack Query, React Context |
| Charts | Recharts |
| Printing | ESC/POS via Bluetooth Serial |
| i18n | i18next |
| Notifications | Firebase Cloud Messaging |

## Database

- **84+ tables** with Row Level Security (RLS)
- **198 migrations** in `supabase/migrations/`
- Multi-tenant architecture with `admin_id` foreign keys
- See [SUPABASE_SETUP_GUIDE.md](SUPABASE_SETUP_GUIDE.md) for setup

## Deployment

### Web (Vercel)
Push to `main` branch → automatic Vercel deployment

### Android APK
```bash
# Live Update APK (loads UI from Vercel, auto-updates)
npm run build:apk:live

# True Offline APK (bundles UI inside APK, manual updates)
npm run build:apk:offline
```
Then open `android/` in Android Studio and build the APK.

## License

[MIT](LICENSE)
