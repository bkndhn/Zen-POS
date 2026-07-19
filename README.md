# ZenPOS

A modern, fast Point of Sale system for restaurants and hotels.

## Features

- 🧾 **Fast Billing** - Touch-based item selection, multiple payment modes
- 👨‍🍳 **Kitchen Display** - Real-time order queue for kitchen staff
- 🍽️ **Service Area** - Track order status and service
- 📊 **Reports** - Daily, weekly, monthly sales and P&L reports
- 📱 **PWA** - Works offline, installable on any device
- 🖨️ **Printer Support** - Bluetooth thermal + browser print
- 👥 **Multi-User** - Admin/staff roles with permissions
- 🔄 **Real-time Sync** - Instant updates across devices

## Tech Stack

- React 18 + TypeScript
- Supabase (Database + Auth + Realtime)
- TailwindCSS + shadcn/ui
- Vite + PWA

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Environment Variables

Create a `.env` file:

```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_key
```

## Deployment

Deployed on Vercel: https://zenpos-tn.vercel.app

## Author

ZenPOS - Made for Tamil Nadu restaurants
