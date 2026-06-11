import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Receipt,
  BarChart3,
  TrendingUp,
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
  History
} from 'lucide-react';

const allNavItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', page: 'dashboard' as const },
  { to: '/analytics', icon: TrendingUp, label: 'Analytics', page: 'analytics' as const },
  { to: '/billing', icon: ShoppingCart, label: 'Billing', page: 'billing' as const },
  { to: '/kitchen', icon: ChefHat, label: 'Kitchen Display', page: 'kitchen' as const },
  { to: '/service-area', icon: ClipboardList, label: 'Service Area', page: 'serviceArea' as const },
  { to: '/tables', icon: LayoutGrid, label: 'Tables', page: 'tables' as const },
  { to: '/table-billing', icon: Receipt, label: 'Table Billing', page: 'tableBilling' as const },
  { to: '/items', icon: Package, label: 'Items', page: 'items' as const },
  { to: '/suppliers', icon: Truck, label: 'Suppliers', page: 'suppliers' as const },
  { to: '/purchases', icon: ShoppingBag, label: 'Purchases', page: 'purchases' as const },
  { to: '/stock', icon: Boxes, label: 'Stock', page: 'stock' as const },
  { to: '/stock-transfers', icon: ArrowRightLeft, label: 'Stock Transfers', page: 'stock' as const },
  { to: '/purchase-returns', icon: Undo2, label: 'Purchase Returns', page: 'purchases' as const },
  { to: '/stock-ledger', icon: History, label: 'Audit Trail', page: 'stock' as const },
  { to: '/stock-reports', icon: BarChart3, label: 'Stock Reports', page: 'stock' as const },
  { to: '/expenses', icon: Receipt, label: 'Expenses', page: 'expenses' as const },
  { to: '/reports', icon: BarChart3, label: 'Reports', page: 'reports' as const },
  { to: '/crm', icon: UserCircle, label: 'CRM', page: 'customers' as const },
  { to: '/qr-menu', icon: QrCode, label: 'QR Menu', page: 'qrMenu' as const },
  { to: '/users', icon: Users, label: 'Users', page: 'users' as const },
  { to: '/settings', icon: Settings, label: 'Settings', page: 'settings' as const },
];


export const Sidebar: React.FC = () => {
  const { profile } = useAuth();
  const location = useLocation();
  const { hasAccess, loading } = useUserPermissions();

  if (!profile || loading) return null;

  // Super Admin: dedicated minimal sidebar
  if (profile.role === 'super_admin') {
    return (
      <div className="hidden md:flex flex-col w-64 bg-sidebar border-r border-sidebar-border h-screen sticky top-0">
        <div className="p-6">
          <h2 className="text-xl font-bold text-sidebar-foreground">Super Admin</h2>
          <p className="text-sm text-sidebar-accent-foreground">Platform control</p>
        </div>
        <nav className="flex-1 px-4">
          <ul className="space-y-1">
            <li>
              <NavLink to="/super-admin/users" className={({ isActive }) => cn(
                "flex items-center px-4 py-2.5 rounded-lg transition-all duration-200 text-sm",
                isActive ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md"
                  : "text-sidebar-accent-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent"
              )}>
                <Users className="w-4 h-4 mr-3" /><span className="font-medium">All Users</span>
              </NavLink>
            </li>
            <li>
              <NavLink to="/users" className={({ isActive }) => cn(
                "flex items-center px-4 py-2.5 rounded-lg transition-all duration-200 text-sm",
                isActive ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md"
                  : "text-sidebar-accent-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent"
              )}>
                <Settings className="w-4 h-4 mr-3" /><span className="font-medium">Admin Management</span>
              </NavLink>
            </li>
          </ul>
        </nav>
      </div>
    );
  }

  // Filter nav items based on permissions
  const navItems = allNavItems.filter(item => hasAccess(item.page));

  return (
    <div className="hidden md:flex flex-col w-64 bg-sidebar border-r border-sidebar-border h-screen sticky top-0">
      <div className="p-6 flex-shrink-0">
        <h2 className="text-xl font-bold text-sidebar-foreground">
          {profile.hotel_name || 'ZenPOS'}
        </h2>
        <p className="text-sm text-sidebar-accent-foreground">POS Management</p>
      </div>

      <nav className="flex-1 px-4 overflow-y-auto min-h-0 pb-6">
        <ul className="space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => {
            const isActive = location.pathname === to ||
              (to === '/billing' && location.pathname === '/');

            return (
              <li key={to}>
                <NavLink
                  to={to}
                  className={cn(
                    "flex items-center px-4 py-2.5 rounded-lg transition-all duration-200 text-sm",
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md"
                      : "text-sidebar-accent-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent"
                  )}
                >
                  <Icon className="w-4 h-4 mr-3 flex-shrink-0" />
                  <span className="font-medium truncate">{label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
};
