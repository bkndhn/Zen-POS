import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import { Users, Settings, ShieldAlert, CreditCard, Shield } from 'lucide-react';
import { ALL_NAV_ITEMS } from '@/config/navItems';
import { useTranslation } from 'react-i18next';
import { ContactSupportDialog } from './ContactSupportDialog';
import { checkOfflineLicenseStatus } from '@/utils/offlineLicenseManager';

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
  '/online-orders': 'nav.onlineOrders',
  '/qr-menu': 'nav.qrMenu',
  '/users': 'nav.users',
  '/settings': 'nav.settings'
};

const allNavItems = ALL_NAV_ITEMS;




interface SidebarProps {
  collapsed?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ collapsed }) => {
  const { profile } = useAuth();
  const location = useLocation();
  const { hasAccess, loading } = useUserPermissions();
  const { t } = useTranslation();
  const [supportOpen, setSupportOpen] = useState(false);

  if (!profile || loading) return null;

  // Super Admin: dedicated minimal sidebar
  if (profile.role === 'super_admin') {
    return (
      <div className={cn(
        "hidden md:flex flex-col w-64 bg-sidebar border-r border-sidebar-border h-screen sticky top-0",
        collapsed && "md:hidden"
      )}>
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
                <Shield className="w-4 h-4 mr-3" /><span className="font-medium font-bold">Super Admin Hub</span>
              </NavLink>
            </li>
          </ul>
        </nav>
      </div>
    );
  }

  // Filter nav items based on permissions
  const navItems = allNavItems.filter(item => {
    if (item.to === '/users' && profile?.role === 'user') return false;
    if (!hasAccess(item.page)) return false;
    if (profile?.client_permissions) {
      if (profile.client_permissions[item.to] === false) return false;
      if (item.page === 'onlineOrders' && profile.client_permissions['allow_online_orders'] === false) return false;
    }
    return true;
  });

  return (
    <div className={cn(
      "hidden md:flex flex-col w-64 bg-sidebar border-r border-sidebar-border h-screen sticky top-0",
      collapsed && "md:hidden"
    )}>
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
          {/* Subscription Renewal Link — admin only */}
          {profile?.role === 'admin' && (() => {
            const license = checkOfflineLicenseStatus();
            const isExpiringSoon = (license.daysUntilExpiry !== undefined && license.daysUntilExpiry <= 7 && license.daysUntilExpiry > 0);
            const isExpired = license.degradationStage === 'locked' || license.degradationStage === 'limited';
            const isRenewActive = location.pathname === '/renew';
            return (
              <li className="mt-2 pt-2 border-t border-sidebar-border">
                <NavLink
                  to="/renew"
                  className={cn(
                    "flex items-center px-4 py-2.5 rounded-lg transition-all duration-200 text-sm",
                    isRenewActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md"
                      : isExpired
                        ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 font-bold"
                        : isExpiringSoon
                          ? "text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950 font-bold"
                          : "text-sidebar-accent-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent"
                  )}
                >
                  <CreditCard className={cn("w-4 h-4 mr-3 flex-shrink-0", isExpired && "animate-pulse text-red-500", isExpiringSoon && "text-amber-500")} />
                  <span className="font-medium truncate">Subscription</span>
                  {isExpiringSoon && <span className="ml-auto text-[10px] bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded-full font-bold">{license.daysUntilExpiry}d</span>}
                  {isExpired && <span className="ml-auto text-[10px] bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 px-1.5 py-0.5 rounded-full font-bold">!</span>}
                </NavLink>
              </li>
            );
          })()}
          <li className="mt-4 pt-4 border-t border-sidebar-border">
            <button
              onClick={() => setSupportOpen(true)}
              className={cn(
                "w-full flex items-center px-4 py-2.5 rounded-lg transition-all duration-200 text-sm text-left",
                "text-primary hover:bg-sidebar-accent hover:text-primary font-bold"
              )}
            >
              <ShieldAlert className="w-4 h-4 mr-3 flex-shrink-0 text-primary animate-pulse" />
              <span className="truncate">Contact Support</span>
            </button>
          </li>
        </ul>
      </nav>

      <ContactSupportDialog open={supportOpen} onOpenChange={setSupportOpen} />
    </div>
  );
};
