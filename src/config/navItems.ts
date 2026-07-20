import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Receipt,
  BarChart3,
  TrendingUp,
  Sparkles,
  Users,
  Settings,
  ClipboardList,
  ChefHat,
  LayoutGrid,
  UserCircle,
  QrCode,
  Truck,
  ShoppingBag,
  Boxes,
  ArrowRightLeft,
  Undo2,
  History,
  Sliders,
  type LucideIcon,
} from 'lucide-react';
import type { UserPermissions } from '@/contexts/PermissionsContext';

export type PageKey = keyof UserPermissions;

export interface NavItem {
  to: string;
  icon: LucideIcon;
  label: string;
  shortLabel?: string;
  page: PageKey;
  /** If true, included in the mobile bottom-nav customisation list. */
  bottomNav?: boolean;
}

/**
 * Single source of truth for app navigation.
 * Used by the desktop Sidebar, Header mobile menu (Sheet), BottomNavigation
 * customiser, and Permissions screens.
 *
 * Adding or removing a page here automatically propagates everywhere.
 */
export const ALL_NAV_ITEMS: NavItem[] = [
  { to: '/dashboard',        icon: LayoutDashboard, label: 'Dashboard',        page: 'dashboard',     bottomNav: true },
  { to: '/analytics',        icon: TrendingUp,      label: 'Analytics',        page: 'analytics',     bottomNav: true },
  { to: '/ai-insights',      icon: Sparkles,        label: 'AI Insights',      shortLabel: 'AI',      page: 'analytics',     bottomNav: true },
  { to: '/billing',          icon: ShoppingCart,    label: 'Billing',          page: 'billing',       bottomNav: true },
  { to: '/kitchen',          icon: ChefHat,         label: 'Kitchen Display',  shortLabel: 'Kitchen', page: 'kitchen',     bottomNav: true },
  { to: '/waiter',           icon: ClipboardList,   label: 'Waiter Companion', shortLabel: 'Waiter',  page: 'waiterCompanion', bottomNav: true },
  { to: '/service-area',     icon: ClipboardList,   label: 'Service Area',     shortLabel: 'Service', page: 'serviceArea', bottomNav: true },
  { to: '/tables',           icon: LayoutGrid,      label: 'Tables',           page: 'tables',        bottomNav: true },
  { to: '/table-billing',    icon: Receipt,         label: 'Table Billing',    shortLabel: 'Table Bill', page: 'tableBilling', bottomNav: true },
  { to: '/items',            icon: Package,         label: 'Items',            page: 'items',         bottomNav: true },
  { to: '/suppliers',        icon: Truck,           label: 'Suppliers',        page: 'suppliers',     bottomNav: true },
  { to: '/purchases',        icon: ShoppingBag,     label: 'Purchases',        page: 'purchases',     bottomNav: true },
  { to: '/stock',            icon: Boxes,           label: 'Stock',            page: 'stock',         bottomNav: true },
  { to: '/stock-transfers',  icon: ArrowRightLeft,  label: 'Stock Transfers',  shortLabel: 'Transfers', page: 'stock',     bottomNav: true },
  { to: '/purchase-returns', icon: Undo2,           label: 'Purchase Returns', shortLabel: 'Returns', page: 'purchases',   bottomNav: true },
  { to: '/stock-ledger',     icon: History,         label: 'Audit Trail',      page: 'stock',         bottomNav: true },
  { to: '/stock-adjustment', icon: Sliders,         label: 'Stock Adjustment', shortLabel: 'Adjust',  page: 'stock',       bottomNav: true },
  { to: '/stock-reports',    icon: BarChart3,       label: 'Stock Reports',    shortLabel: 'Stock Rpt', page: 'stock',     bottomNav: true },
  { to: '/expenses',         icon: Receipt,         label: 'Expenses',         page: 'expenses',      bottomNav: true },
  { to: '/reports',          icon: BarChart3,       label: 'Reports',          page: 'reports',       bottomNav: true },
  { to: '/crm',              icon: UserCircle,      label: 'CRM',              page: 'customers',     bottomNav: true },
  { to: '/qr-menu',          icon: QrCode,          label: 'QR Menu',          page: 'qrMenu',        bottomNav: true },
  { to: '/users',            icon: Users,           label: 'Users',            page: 'users' },
  { to: '/settings',         icon: Settings,        label: 'Settings',         page: 'settings',      bottomNav: true },
];

/** Unique page keys that appear in the bottom-nav customiser. */
export const BOTTOM_NAV_OPTIONS: { id: PageKey; label: string }[] = (() => {
  const seen = new Set<PageKey>();
  const out: { id: PageKey; label: string }[] = [];
  for (const item of ALL_NAV_ITEMS) {
    if (!item.bottomNav) continue;
    if (seen.has(item.page)) continue;
    seen.add(item.page);
    out.push({ id: item.page, label: item.shortLabel || item.label });
  }
  return out;
})();
