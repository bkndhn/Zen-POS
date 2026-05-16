import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useBranch } from '@/contexts/BranchContext';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import {
  ShoppingCart,
  Package,
  Receipt,
  BarChart3,
  TrendingUp,
  Settings,
  ClipboardList,
  LayoutGrid,
  ChefHat,
  Users,
  QrCode
} from 'lucide-react';

const allNavItems = [
  { to: '/analytics', icon: TrendingUp, label: 'Analytics', page: 'analytics' as const },
  { to: '/billing', icon: ShoppingCart, label: 'Billing', page: 'billing' as const },
  { to: '/kitchen', icon: ChefHat, label: 'Kitchen', page: 'kitchen' as const },
  { to: '/service-area', icon: ClipboardList, label: 'Service', page: 'serviceArea' as const },
  { to: '/tables', icon: LayoutGrid, label: 'Tables', page: 'tables' as const },
  { to: '/table-billing', icon: Receipt, label: 'Table Bill', page: 'tableBilling' as const },
  { to: '/items', icon: Package, label: 'Items', page: 'items' as const },
  { to: '/expenses', icon: Receipt, label: 'Expenses', page: 'expenses' as const },
  { to: '/reports', icon: BarChart3, label: 'Reports', page: 'reports' as const },
  { to: '/crm', icon: Users, label: 'CRM', page: 'customers' as const },
  { to: '/qr-menu', icon: QrCode, label: 'QR Menu', page: 'qrMenu' as const },
  { to: '/settings', icon: Settings, label: 'Settings', page: 'settings' as const },
];


export const BottomNavigation: React.FC = () => {
  const { profile } = useAuth();
  const location = useLocation();
  const { hasAccess, loading } = useUserPermissions();
  const { operatingBranchId } = useBranch();
  const [visiblePages, setVisiblePages] = useState<string[] | null>(null);

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
            setVisiblePages(['analytics', 'billing', 'serviceArea', 'tables', 'tableBilling', 'items', 'expenses', 'reports', 'settings', 'kitchen', 'customers', 'qrMenu']);
          }
        } catch {
          setVisiblePages(['analytics', 'billing', 'serviceArea', 'tables', 'tableBilling', 'items', 'expenses', 'reports', 'settings', 'kitchen', 'customers', 'qrMenu']);
        }
      } else {
        setVisiblePages(['analytics', 'billing', 'serviceArea', 'tables', 'tableBilling', 'items', 'expenses', 'reports', 'settings', 'kitchen', 'customers', 'qrMenu']);
      }

      // Then sync from Supabase for latest data
      if (profile?.user_id) {
        try {
          const { createClient } = await import('@supabase/supabase-js');
          const supabase = createClient(
            "https://ivleyttlqlqawghvfyjz.supabase.co",
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml2bGV5dHRscWxxYXdnaHZmeWp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyMTc1NjAsImV4cCI6MjA4NDc5MzU2MH0.2LpChU5d2awwu_Wu9XckGT6kGPFHqBA0fyhqvNMne3M"
          );
          let query = supabase
            .from('shop_settings')
            .select('visible_nav_pages')
            .eq('user_id', profile.user_id);

          if (operatingBranchId) {
            query = query.eq('branch_id', operatingBranchId);
          } else {
            query = query.is('branch_id', null);
          }

          const { data } = await query.maybeSingle();

          if (data?.visible_nav_pages && Array.isArray(data.visible_nav_pages)) {
            // Auto-inject any new pages that didn't exist when the user last saved
            const savedPages = data.visible_nav_pages as string[];
            const requiredNewPages = ['tableBilling'];
            const updated = [...savedPages];
            requiredNewPages.forEach(p => { if (!updated.includes(p)) updated.push(p); });
            setVisiblePages(updated);
            // Update localStorage cache
            const headerKey = operatingBranchId ? `hotel_pos_bill_header_${operatingBranchId}` : 'hotel_pos_bill_header';
            const cached = localStorage.getItem(headerKey) ?? localStorage.getItem('hotel_pos_bill_header');
            if (cached) {
              try {
                const parsed = JSON.parse(cached);
                parsed.visiblePages = updated;
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

  // Filter nav items based on permissions AND visibility settings
  const navItems = allNavItems
    .filter(item => hasAccess(item.page))
    .filter(item => visiblePages === null || visiblePages.includes(item.page as string));

  return (
    <nav className="fixed bottom-0 left-0 right-0 md:hidden z-50">
      {/* Premium clean background with subtle shadow - dark mode aware */}
      <div className="absolute inset-0 bg-card shadow-[0_-4px_20px_rgba(0,0,0,0.08)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.3)] border-t border-border" />

      <div
        className="relative flex justify-around items-center py-1.5 sm:py-2 px-0.5 sm:px-1"
        style={{ paddingBottom: 'max(6px, env(safe-area-inset-bottom, 6px))' }}
      >
        {navItems.map(({ to, icon: Icon, label }) => {
          const isActive = location.pathname === to ||
            (to === '/billing' && location.pathname === '/');

          return (
            <NavLink
              key={to}
              to={to}
              className="flex flex-col items-center justify-center py-0.5 px-0.5 min-w-0 flex-1"
            >
              {/* Icon container - rounded square for active, plain for inactive */}
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
              )}>{label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};
