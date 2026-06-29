import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import { Users, Settings } from 'lucide-react';
import { ALL_NAV_ITEMS } from '@/config/navItems';
import { useTranslation } from 'react-i18next';

const labelMap: Record<string, string> = {
  '/dashboard': 'nav.dashboard',
  '/analytics': 'nav.analytics',
  '/billing': 'nav.billing',
  '/kitchen': 'nav.kitchen',
  '/waiter': 'nav.waiter',
  '/service-area': 'nav.serviceArea',
  '/tables': 'nav.tables',
  '/table-billing': 'nav.tableBilling',
  '/items': 'nav.items',
  '/suppliers': 'nav.suppliers',
  '/purchases': 'nav.purchases',
  '/stock': 'nav.stock',
  '/stock-transfers': 'nav.stockTransfers',
  '/purchase-returns': 'nav.purchaseReturns',
  '/stock-ledger': 'nav.stockLedger',
  '/stock-reports': 'nav.stockReports',
  '/expenses': 'nav.expenses',
  '/reports': 'nav.reports',
  '/crm': 'nav.crm',
  '/qr-menu': 'nav.qrMenu',
  '/users': 'nav.users',
  '/settings': 'nav.settings'
};

const allNavItems = ALL_NAV_ITEMS;




export const Sidebar: React.FC = () => {
  const { profile } = useAuth();
  const location = useLocation();
  const { hasAccess, loading } = useUserPermissions();
  const { t } = useTranslation();

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
  const navItems = allNavItems.filter(item => {
    if (!hasAccess(item.page)) return false;
    if (profile?.client_permissions && profile.client_permissions[item.to] === false) {
      return false;
    }
    return true;
  });

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
            const transKey = labelMap[to];
            const displayLabel = transKey ? t(transKey) : label;

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
                  <span className="font-medium truncate">{displayLabel}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
};
