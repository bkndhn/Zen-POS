# Contributing to ZenPOS

Thank you for your interest in contributing to ZenPOS! This document provides guidelines and instructions for contributing.

## Prerequisites

- **Node.js** >= 20.x
- **npm** >= 10.x (do NOT use bun/yarn — we standardize on npm)
- **Supabase CLI** (optional, for local database development)
- **Android Studio** (optional, for Capacitor APK builds)

## Getting Started

```bash
# Clone the repository
git clone https://github.com/bkndhn/Zen-POS.git
cd Zen-POS

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Fill in your Supabase credentials in .env

# Start development server
npm run dev
```

## Project Structure

```
src/
├── components/       # Reusable UI components
│   ├── ui/           # shadcn/ui primitives (Button, Dialog, etc.)
│   ├── billing/      # Billing-specific components
│   ├── settings/     # Settings panel components
│   ├── dialogs/      # Modal dialogs
│   ├── offline/      # Offline status indicators
│   ├── admin/        # Super admin components
│   └── shared/       # Shared/common components
├── pages/            # Route-level page components
├── hooks/            # Custom React hooks
├── contexts/         # React context providers
├── utils/            # Business logic utilities
│   └── storage/      # SQLite/IndexedDB storage backends
├── integrations/     # Third-party integrations (Supabase)
├── types/            # TypeScript type definitions
├── i18n/             # Internationalization
└── config/           # App configuration
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript type checking |
| `npm run test` | Run tests with Vitest |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Run ESLint |
| `npm run safe-push` | Typecheck + build + push to main |
| `npm run build:apk:live` | Build Live Update APK |
| `npm run build:apk:offline` | Build True Offline APK |

## Code Style Guidelines

1. **Components**: Use PascalCase for component files (e.g., `BillingCart.tsx`)
2. **Hooks**: Use camelCase with `use` prefix (e.g., `useBilling.ts`)
3. **Utils**: Use camelCase (e.g., `printerManager.ts`)
4. **Types**: Prefer interfaces over type aliases for object shapes
5. **Imports**: Use `@/` path alias for absolute imports

## Database Migrations

Migrations live in `supabase/migrations/`. To create a new migration:

1. Write your SQL in a new file: `supabase/migrations/YYYYMMDDHHMMSS_description.sql`
2. Apply via the Supabase dashboard SQL editor or Supabase CLI
3. Update `src/integrations/supabase/types.ts` if schema changes affect the frontend

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — New feature
- `fix:` — Bug fix
- `perf:` — Performance improvement
- `docs:` — Documentation only
- `refactor:` — Code change that neither fixes a bug nor adds a feature
- `test:` — Adding or correcting tests
- `chore:` — Maintenance tasks

## Testing

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch
```

## Need Help?

- Check the [README.md](README.md) for architecture overview
- Check the [CHANGELOG.md](CHANGELOG.md) for version history
- Open an issue on GitHub for bugs or feature requests
