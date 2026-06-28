import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useBranch } from '@/contexts/BranchContext';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import { ALL_NAV_ITEMS } from '@/config/navItems';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { MoreHorizontal } from 'lucide-react';
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

const allNavItems = ALL_NAV_ITEMS.filter(i => i.bottomNav);
const MAX_BOTTOM_VISIBLE = 5; // shown directly; rest go behind "More"



export const BottomNavigation: React.FC = () => {
  const { profile } = useAuth();
  const location = useLocation();
  const { hasAccess, loading } = useUserPermissions();
  const { operatingBranchId } = useBranch();
  const [visiblePages, setVisiblePages] = useState<string[]>([]);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    // Load from Supabase as primary source, with localStorage as fallback
    const loadSettings = async () => {
      // First, load from localStorage for instant display
      const headerKey = operatingBranchId ? `hotel_pos_bill_header_${operatingBranchId}` : 'hotel_pos_bill_header';
      const saved = localStorage.getItem(headerKey) ?? localStorage.getItem('hotel_pos_bill_header');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.visiblePages && Array.isArray(parsed.visiblePages)) {
            setVisiblePages(parsed.visiblePages);
          } else {
            setVisiblePages(['analytics', 'billing', 'serviceArea', 'tables', 'tableBilling', 'items', 'expenses', 'reports', 'settings', 'kitchen', 'waiterCompanion', 'customers', 'qrMenu']);
          }
        } catch {
          setVisiblePages(['analytics', 'billing', 'serviceArea', 'tables', 'tableBilling', 'items', 'expenses', 'reports', 'settings', 'kitchen', 'waiterCompanion', 'customers', 'qrMenu']);
        }
      } else {
        setVisiblePages(['analytics', 'billing', 'serviceArea', 'tables', 'tableBilling', 'items', 'expenses', 'reports', 'settings', 'kitchen', 'waiterCompanion', 'customers', 'qrMenu']);
      }

      // Then sync from Supabase for latest data
      if (profile?.user_id) {
        try {
          const { createClient } = await import('@supabase/supabase-js');
          const supabase = createClient(
            "https://ivleyttlqlqawghvfyjz.supabase.co",
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml2bGV5dHRscWxxYXdnaHZmeWp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyMTc1NjAsImV4cCI6MjA4NDc5MzU2MH0.2LpChU5d2awwu_Wu9XckGT6kGPFHqBA0fyhqvNMne3M"
          );
          const adminId = profile?.role === 'admin' ? profile.id : profile?.admin_id;
          let query = supabase
            .from('shop_settings')
            .select('visible_nav_pages')
            .eq('user_id', adminId || profile.user_id);

          if (operatingBranchId) {
            query = query.eq('branch_id', operatingBranchId);
          } else {
            query = query.is('branch_id', null);
          }

          const { data } = await query.maybeSingle();

          if (data?.visible_nav_pages && Array.isArray(data.visible_nav_pages)) {
            // Respect the user's explicit selection exactly — do NOT auto-inject pages
            // they have intentionally disabled.
            const savedPages = data.visible_nav_pages as string[];
            setVisiblePages(savedPages);
            const headerKey = operatingBranchId ? `hotel_pos_bill_header_${operatingBranchId}` : 'hotel_pos_bill_header';
            const cached = localStorage.getItem(headerKey) ?? localStorage.getItem('hotel_pos_bill_header');
            if (cached) {
              try {
                const parsed = JSON.parse(cached);
                parsed.visiblePages = savedPages;
                localStorage.setItem(headerKey, JSON.stringify(parsed));
              } catch { }
            }
          }
        } catch (err) {
          console.error('Error fetching nav settings from Supabase:', err);
        }
      }
    };

    loadSettings();

    // Listen for updates
    const handleUpdate = (e: CustomEvent) => {
      if (e.detail && Array.isArray(e.detail)) {
        setVisiblePages(e.detail);
      } else {
        loadSettings();
      }
    };

    // Also listen to general shop settings update which updates localStorage
    const handleShopUpdate = () => loadSettings();

    window.addEventListener('nav-settings-updated', handleUpdate as EventListener);
    window.addEventListener('shop-settings-updated', handleShopUpdate);

    return () => {
      window.removeEventListener('nav-settings-updated', handleUpdate as EventListener);
      window.removeEventListener('shop-settings-updated', handleShopUpdate);
    };
  }, [profile?.user_id, operatingBranchId]);

  if (!profile || loading) return null;

  // Super Admin doesn't need bottom navigation - they only see Users page
  if (profile.role === 'super_admin') return null;

  // Filter nav items by permissions AND the user's explicit visibility selection.
  // If visiblePages is empty (never saved) fall back to permission-only filtering.
  // NEW_PAGE_KEYS = modules added after the original visibility list shipped.
  // These are auto-included so newly-added pages never silently disappear from
  // an older user's saved customisation. (Users can still disable them by
  // re-saving the bottom-nav customiser.)
  const NEW_PAGE_KEYS = new Set(['suppliers', 'purchases', 'stock', 'tableBilling']);
  const navItems = allNavItems
    .filter(item => hasAccess(item.page))
    .filter(item =>
      visiblePages.length === 0
      || visiblePages.includes(item.page as string)
      || NEW_PAGE_KEYS.has(item.page as string)
    );


  // Split into primary tabs + "More" overflow when too many are enabled
  const needsMore = navItems.length > MAX_BOTTOM_VISIBLE;
  const primary = needsMore ? navItems.slice(0, MAX_BOTTOM_VISIBLE - 1) : navItems;
  const overflow = needsMore ? navItems.slice(MAX_BOTTOM_VISIBLE - 1) : [];
  const isOverflowActive = overflow.some(i => location.pathname === i.to);

  const renderTab = (item: typeof navItems[number]) => {
    const { to, icon: Icon } = item;
    const label = item.shortLabel || item.label;
    const isActive = location.pathname === to || (to === '/billing' && location.pathname === '/');
    const transKey = labelMap[to];
    const displayLabel = transKey ? t(transKey) : label;

    return (
      <NavLink
        key={to}
        to={to}
        className="flex flex-col items-center justify-center py-0.5 px-0.5 min-w-0 flex-1"
      >
        <div className={cn(
          "flex items-center justify-center transition-all duration-300",
          isActive
            ? "w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-primary to-primary/90 shadow-lg shadow-primary/30"
            : "w-7 h-7 sm:w-8 sm:h-8"
        )}>
          <Icon className={cn(
            "transition-all duration-300",
            isActive ? "w-4 h-4 sm:w-5 sm:h-5 text-white" : "w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground"
          )} />
        </div>
        <span className={cn(
          "text-[11px] sm:text-[12px] mt-0.5 transition-all duration-300 font-medium truncate max-w-full",
          isActive ? "text-primary" : "text-muted-foreground"
        )}>{displayLabel}</span>
      </NavLink>
    );
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 md:hidden z-50">
      <div className="absolute inset-0 bg-card shadow-[0_-4px_20px_rgba(0,0,0,0.08)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.3)] border-t border-border" />

      <div
        className="relative flex justify-around items-center py-1.5 sm:py-2 px-0.5 sm:px-1"
        style={{ paddingBottom: 'max(6px, env(safe-area-inset-bottom, 6px))' }}
      >
        {primary.map(renderTab)}

        {needsMore && (
          <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className="flex flex-col items-center justify-center py-0.5 px-0.5 min-w-0 flex-1"
                aria-label="More navigation options"
              >
                <div className={cn(
                  "flex items-center justify-center transition-all duration-300",
                  isOverflowActive
                    ? "w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-primary to-primary/90 shadow-lg shadow-primary/30"
                    : "w-7 h-7 sm:w-8 sm:h-8"
                )}>
                  <MoreHorizontal className={cn(
                    "transition-all duration-300",
                    isOverflowActive ? "w-4 h-4 sm:w-5 sm:h-5 text-white" : "w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground"
                  )} />
                </div>
                <span className={cn(
                  "text-[11px] sm:text-[12px] mt-0.5 font-medium truncate max-w-full",
                  isOverflowActive ? "text-primary" : "text-muted-foreground"
                )}>More</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-2xl pb-8 max-h-[70vh] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>More</SheetTitle>
              </SheetHeader>
              <div className="grid grid-cols-4 gap-3 mt-4">
                {overflow.map(item => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.to;
                  const itemTransKey = labelMap[item.to];
                  const itemDisplayLabel = itemTransKey ? t(itemTransKey) : (item.shortLabel || item.label);
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setIsSheetOpen(false)}
                      className={cn(
                        "flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl border transition-colors",
                        isActive ? "bg-primary/10 border-primary/40 text-primary" : "bg-card hover:bg-muted border-border text-foreground"
                      )}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-[11px] font-medium text-center leading-tight">{itemDisplayLabel}</span>
                    </NavLink>
                  );
                })}
              </div>
            </SheetContent>
          </Sheet>
        )}
      </div>
    </nav>
  );
};
