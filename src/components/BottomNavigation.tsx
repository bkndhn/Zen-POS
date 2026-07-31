import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useBranch } from '@/contexts/BranchContext';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import { ALL_NAV_ITEMS, getFilteredNavItems } from '@/config/navItems';
import { useBranchSettings } from '@/hooks/useBranchSettings';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { MoreHorizontal, CreditCard, Users as UsersIcon, Database, Settings, FileText, Shield, Activity, LayoutDashboard, Receipt } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';

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
  '/settings': 'nav.settings',
  '/online-orders': 'nav.onlineOrders',
};

const MAX_BOTTOM_VISIBLE = 5;

// Lightweight haptic tap on Android WebView / iOS Safari where supported.
const haptic = () => {
  try { (navigator as any).vibrate?.(8); } catch { /* noop */ }
};

// Best-effort route chunk prefetch — matches App.tsx lazy() imports.
const routePrefetch: Record<string, () => Promise<any>> = {
  '/dashboard': () => import('@/pages/Dashboard'),
  '/analytics': () => import('@/pages/DashboardAnalytics'),
  '/billing': () => import('@/pages/Billing'),
  '/items': () => import('@/pages/Items'),
  '/expenses': () => import('@/pages/Expenses'),
  '/reports': () => import('@/pages/Reports'),
  '/settings': () => import('@/pages/Settings'),
  '/service-area': () => import('@/pages/ServiceArea'),
  '/kitchen': () => import('@/pages/KitchenDisplay'),
  '/tables': () => import('@/pages/TableManagement'),
  '/crm': () => import('@/pages/CRM'),
  '/qr-menu': () => import('@/pages/QRMenu'),
  '/table-billing': () => import('@/pages/TableOrderBilling'),
  '/waiter': () => import('@/pages/WaiterCompanion'),
  '/suppliers': () => import('@/pages/Suppliers'),
  '/purchases': () => import('@/pages/Purchases'),
  '/stock': () => import('@/pages/StockManagement'),
  '/stock-reports': () => import('@/pages/StockReports'),
  '/stock-transfers': () => import('@/pages/StockTransfers'),
  '/users': () => import('@/pages/Users'),
  '/online-orders': () => import('@/pages/OnlineOrders'),
};

export const BottomNavigation: React.FC = () => {
  const { profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { hasAccess, loading } = useUserPermissions();
  const { operatingBranchId } = useBranch();
  const { settings } = useBranchSettings();
  const allNavItems = getFilteredNavItems(settings?.business_type).filter(i => i.bottomNav);
  const [visiblePages, setVisiblePages] = useState<string[]>([]);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    let cancelled = false;
    const loadSettings = async () => {
      const headerKey = operatingBranchId ? `hotel_pos_bill_header_${operatingBranchId}` : 'hotel_pos_bill_header';
      const saved = localStorage.getItem(headerKey);
      let localPages: string[] | null = null;
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed.visiblePages)) {
            localPages = parsed.visiblePages;
            if (!cancelled) setVisiblePages(localPages!);
          }
        } catch { /* ignore */ }
      }

      if (!profile?.user_id) return;
      try {
        let targetUserId = profile.user_id;
        if (profile.role !== 'admin' && profile.admin_id) {
          const { data: adminProfile } = await supabase
            .from('profiles').select('user_id').eq('id', profile.admin_id).maybeSingle();
          if (adminProfile?.user_id) targetUserId = adminProfile.user_id;
        }
        let query = supabase.from('shop_settings').select('visible_nav_pages').eq('user_id', targetUserId);
        query = operatingBranchId ? query.eq('branch_id', operatingBranchId) : query.is('branch_id', null);
        const { data } = await query.maybeSingle();
        if (cancelled) return;
        if (data?.visible_nav_pages && Array.isArray(data.visible_nav_pages)) {
          let savedPages = data.visible_nav_pages as string[];
          const isOnlineOrdersAllowed = hasAccess('onlineOrders') && profile?.client_permissions?.['/online-orders'] !== false && profile?.client_permissions?.['allow_online_orders'] !== false;
          const initKey = `online_orders_init_${targetUserId}`;
          if (isOnlineOrdersAllowed && !savedPages.includes('onlineOrders') && localStorage.getItem(initKey) !== 'dismissed') {
            savedPages = [...savedPages, 'onlineOrders'];
          }
          setVisiblePages(savedPages);
          if (saved) {
            try {
              const parsed = JSON.parse(saved);
              parsed.visiblePages = savedPages;
              localStorage.setItem(headerKey, JSON.stringify(parsed));
            } catch { /* ignore */ }
          }
        } else if (!localPages) {
          setVisiblePages([]);
        }
      } catch (err) {
        console.error('Nav settings sync failed:', err);
      }
    };

    loadSettings();

    const handleUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (Array.isArray(detail)) setVisiblePages(detail);
      else loadSettings();
    };
    const handleShopUpdate = () => loadSettings();
    window.addEventListener('nav-settings-updated', handleUpdate);
    window.addEventListener('shop-settings-updated', handleShopUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener('nav-settings-updated', handleUpdate);
      window.removeEventListener('shop-settings-updated', handleShopUpdate);
    };
  }, [profile?.user_id, profile?.role, profile?.admin_id, operatingBranchId, hasAccess, profile?.client_permissions]);

  const navItems = useMemo(() => {
    if (!profile) return [];
    return allNavItems
      .filter(item => {
        if (!hasAccess(item.page)) return false;
        if (profile.client_permissions) {
          if (profile.client_permissions[item.to] === false) return false;
          if (item.page === 'onlineOrders' && profile.client_permissions['allow_online_orders'] === false) return false;
        }
        return true;
      })
      .filter(item => visiblePages.length === 0 || visiblePages.includes(item.page as string));
  }, [profile, hasAccess, visiblePages]);

  const { primary, overflow, needsMore } = useMemo(() => {
    const needs = navItems.length > MAX_BOTTOM_VISIBLE;
    return {
      needsMore: needs,
      primary: needs ? navItems.slice(0, MAX_BOTTOM_VISIBLE - 1) : navItems,
      overflow: needs ? navItems.slice(MAX_BOTTOM_VISIBLE - 1) : [],
    };
  }, [navItems]);

  const isOverflowActive = overflow.some(i => location.pathname === i.to);

  const prefetch = useCallback((path: string) => {
    const fn = routePrefetch[path];
    if (fn) fn().catch(() => { /* prefetch is best-effort */ });
  }, []);

  if (!profile || loading) return null;

  if (profile.role === 'super_admin') {
    const superAdminNavItems = [
      { to: '/super-admin/users?tab=users', tabKey: 'users', label: 'Users & Staff', icon: UsersIcon },
      { to: '/super-admin/users?tab=subscriptions', tabKey: 'subscriptions', label: 'Subs', icon: CreditCard },
      { to: '/super-admin/users?tab=backups', tabKey: 'backups', label: 'Backups', icon: Database },
      { to: '/super-admin/users?tab=support', tabKey: 'support', label: 'Support', icon: Settings },
      { to: '/super-admin/rum', tabKey: 'rum', label: 'RUM Metrics', icon: Activity },
    ];

    const currentTab = new URLSearchParams(location.search).get('tab') || 'users';

    return (
      <nav className="fixed bottom-0 left-0 right-0 md:hidden z-50" aria-label="Super Admin Bottom Navigation">
        <div className="absolute inset-x-0 -top-6 h-6 bg-gradient-to-t from-black/5 to-transparent dark:from-black/30 pointer-events-none" />
        <div className="absolute inset-0 bg-card/90 dark:bg-card/80 backdrop-blur-xl border-t border-border/70 shadow-[0_-6px_24px_-8px_rgba(0,0,0,0.15)] dark:shadow-[0_-8px_28px_-6px_rgba(0,0,0,0.55)]" />
        <div
          className="relative flex justify-around items-center px-1 sm:px-2"
          style={{
            paddingTop: '4px',
            paddingBottom: 'max(8px, env(safe-area-inset-bottom, 8px))',
          }}
        >
          {superAdminNavItems.map(item => {
            const Icon = item.icon;
            const isActive = item.to.startsWith('/super-admin/rum') 
              ? location.pathname === '/super-admin/rum'
              : (location.pathname === '/super-admin/users' && currentTab === item.tabKey);

            return (
              <NavLink
                key={item.label}
                to={item.to}
                onClick={haptic}
                className="group relative flex flex-col items-center justify-center py-1 px-0.5 min-w-0 flex-1 select-none"
              >
                <div
                  className={cn(
                    'relative flex items-center justify-center transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
                    isActive
                      ? 'w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-primary to-primary/80 shadow-[0_8px_20px_-6px_hsl(var(--primary)/0.55)] scale-100'
                      : 'w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-transparent group-active:scale-90'
                  )}
                >
                  <Icon
                    className={cn(
                      'transition-all duration-300',
                      isActive ? 'w-5 h-5 text-primary-foreground' : 'w-[18px] h-[18px] text-muted-foreground group-hover:text-foreground'
                    )}
                    strokeWidth={isActive ? 2.4 : 2}
                  />
                </div>
                <span
                  className={cn(
                    'text-[10.5px] mt-1 font-medium tracking-tight transition-all duration-300 truncate max-w-full',
                    isActive ? 'text-primary font-semibold' : 'text-muted-foreground'
                  )}
                >
                  {item.label}
                </span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    );
  }

  const renderTab = (item: (typeof navItems)[number]) => {
    const { to, icon: Icon } = item;
    const label = item.shortLabel || item.label;
    const isActive = location.pathname === to || (to === '/billing' && location.pathname === '/');
    const transKey = labelMap[to];
    const displayLabel = transKey ? t(transKey) : label;

    return (
      <NavLink
        key={to}
        to={to}
        onPointerDown={() => { prefetch(to); }}
        onClick={haptic}
        className="group relative flex flex-col items-center justify-center py-1 px-0.5 min-w-0 flex-1 select-none"
      >
        {/* Active pill background — animates in */}
        <div
          className={cn(
            'relative flex items-center justify-center transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
            isActive
              ? 'w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-primary to-primary/80 shadow-[0_8px_20px_-6px_hsl(var(--primary)/0.55)] scale-100'
              : 'w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-transparent group-active:scale-90'
          )}
        >
          <Icon
            className={cn(
              'transition-all duration-300',
              isActive ? 'w-5 h-5 sm:w-5.5 sm:h-5.5 text-primary-foreground' : 'w-[18px] h-[18px] sm:w-5 sm:h-5 text-muted-foreground group-hover:text-foreground'
            )}
            strokeWidth={isActive ? 2.4 : 2}
          />
        </div>
        <span
          className={cn(
            'text-[10.5px] sm:text-[11.5px] mt-1 font-medium tracking-tight transition-all duration-300 truncate max-w-full',
            isActive ? 'text-primary font-semibold' : 'text-muted-foreground'
          )}
        >
          {displayLabel}
        </span>
      </NavLink>
    );
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 md:hidden z-50" aria-label="Primary">
      {/* Layered premium background: subtle gradient veil + blurred glass */}
      <div className="absolute inset-x-0 -top-6 h-6 bg-gradient-to-t from-black/5 to-transparent dark:from-black/30 pointer-events-none" aria-hidden />
      <div
        className="absolute inset-0 bg-card/85 dark:bg-card/70 backdrop-blur-xl border-t border-border/70 shadow-[0_-6px_24px_-8px_rgba(0,0,0,0.15)] dark:shadow-[0_-8px_28px_-6px_rgba(0,0,0,0.55)]"
        aria-hidden
      />
      <div
        className="relative flex justify-around items-center px-1 sm:px-2"
        style={{
          paddingTop: '4px',
          paddingBottom: 'max(8px, env(safe-area-inset-bottom, 8px))',
        }}
      >
        {primary.map(renderTab)}

        {needsMore && (
          <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                onPointerDown={haptic}
                className="group relative flex flex-col items-center justify-center py-1 px-0.5 min-w-0 flex-1 select-none"
                aria-label="More navigation options"
              >
                <div
                  className={cn(
                    'flex items-center justify-center transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
                    isOverflowActive
                      ? 'w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-primary to-primary/80 shadow-[0_8px_20px_-6px_hsl(var(--primary)/0.55)]'
                      : 'w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-transparent group-active:scale-90'
                  )}
                >
                  <MoreHorizontal
                    className={cn(
                      'transition-all duration-300',
                      isOverflowActive ? 'w-5 h-5 text-primary-foreground' : 'w-[18px] h-[18px] sm:w-5 sm:h-5 text-muted-foreground'
                    )}
                    strokeWidth={isOverflowActive ? 2.4 : 2}
                  />
                </div>
                <span
                  className={cn(
                    'text-[10.5px] sm:text-[11.5px] mt-1 font-medium tracking-tight transition-all duration-300 truncate max-w-full',
                    isOverflowActive ? 'text-primary font-semibold' : 'text-muted-foreground'
                  )}
                >
                  More
                </span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-3xl pb-8 max-h-[75vh] overflow-y-auto border-t border-border/60 bg-card/95 backdrop-blur-xl">
              <div className="mx-auto -mt-2 mb-2 h-1.5 w-12 rounded-full bg-muted-foreground/25" aria-hidden />
              <SheetHeader>
                <SheetTitle className="text-left">More</SheetTitle>
              </SheetHeader>
              <div className="grid grid-cols-4 gap-3 mt-4">
                {overflow.map(item => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.to;
                  const itemTransKey = labelMap[item.to];
                  const itemDisplayLabel = itemTransKey ? t(itemTransKey) : (item.shortLabel || item.label);
                  return (
                    <button
                      key={item.to}
                      onPointerDown={() => prefetch(item.to)}
                      onClick={() => { haptic(); setIsSheetOpen(false); navigate(item.to); }}
                      className={cn(
                        'flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border transition-all active:scale-95',
                        isActive
                          ? 'bg-primary/10 border-primary/40 text-primary shadow-sm'
                          : 'bg-card/60 hover:bg-muted border-border/60 text-foreground'
                      )}
                    >
                      <div className={cn(
                        'flex items-center justify-center w-10 h-10 rounded-xl',
                        isActive ? 'bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-[0_6px_16px_-6px_hsl(var(--primary)/0.6)]' : 'bg-muted/60'
                      )}>
                        <Icon className="w-5 h-5" strokeWidth={isActive ? 2.4 : 2} />
                      </div>
                      <span className="text-[11px] font-medium text-center leading-tight">{itemDisplayLabel}</span>
                    </button>
                  );
                })}
              </div>
              {/* Subscription link for admin users */}
              {profile?.role === 'admin' && (
                <div className="mt-4 pt-3 border-t border-border/50">
                  <button
                    onClick={() => { haptic(); setIsSheetOpen(false); navigate('/renew'); }}
                    className={cn(
                      'w-full flex items-center gap-3 p-3 rounded-2xl border transition-all active:scale-95',
                      location.pathname === '/renew'
                        ? 'bg-primary/10 border-primary/40 text-primary shadow-sm'
                        : 'bg-card/60 hover:bg-muted border-border/60 text-foreground'
                    )}
                  >
                    <div className={cn(
                      'flex items-center justify-center w-10 h-10 rounded-xl',
                      location.pathname === '/renew'
                        ? 'bg-gradient-to-br from-primary to-primary/80 text-primary-foreground'
                        : 'bg-muted/60'
                    )}>
                      <CreditCard className="w-5 h-5" />
                    </div>
                    <span className="text-sm font-medium">Subscription</span>
                  </button>
                </div>
              )}
            </SheetContent>
          </Sheet>
        )}
      </div>
    </nav>
  );
};
