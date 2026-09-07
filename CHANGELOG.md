# Changelog

All notable changes to ZenPOS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-09-07

### Added
- Complete POS billing system with offline support
- Kitchen Display System (KDS) with real-time order tracking
- Table management with floor plan editor
- Waiter companion mobile view
- QR code public menu with remote ordering
- Stock management with batch tracking, transfers, and adjustments
- Purchase management with GRN and returns
- CRM with customer ledger (Khata) system
- Multi-branch support with branch-scoped data isolation
- Role-based access control with page-level permissions
- Bluetooth thermal printer support (58mm/80mm)
- GST tax management with HSN codes
- Shift management with Z-reports and reconciliation
- AI-powered insights and menu import
- FCM push notifications (web + native)
- Encrypted backups with scheduled cloud backup
- Super admin console with storage quotas and licensing
- PWA with full offline capability via Service Worker
- Capacitor Android APK with dual-build pipeline (Live + Offline)
- SQLite storage with SQLCipher encryption on native
- Write queue with automatic background sync
- i18n support (English, Hindi, Telugu, Tamil, Kannada, Malayalam, Bengali, Marathi)

### Security
- Database hardening: Foreign key constraints on all 35+ tenant tables
- RLS policies standardized to use profile UUIDs exclusively
- Configurable offline grace period (7/30/90/365 days) per client
- SQLCipher encryption for on-device SQLite databases

### Performance
- Virtualized item grid for 500+ menu catalogs
- Narrowed SQL selects across Billing, Reports, and Items pages
- 11 composite SQLite indexes for multi-branch query performance
- Synchronous flush on money-critical writes (bills, payments, shifts)
- Write queue deduplication to prevent queue bloat
