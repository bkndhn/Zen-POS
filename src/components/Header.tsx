import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import { NavLink, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { LogOut, User, Hotel, Menu, Sun, Moon, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LanguageSwitcher } from './LanguageSwitcher';
import { BranchSwitcher } from './BranchSwitcher';
import { ALL_NAV_ITEMS } from '@/config/navItems';
import { ContactSupportDialog } from './ContactSupportDialog';

const allNavItems = ALL_NAV_ITEMS;

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


interface HeaderProps {
  onToggleSidebar?: () => void;
  sidebarCollapsed?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onToggleSidebar, sidebarCollapsed }) => {
  const { t } = useTranslation();
  const { profile, signOut } = useAuth();
  const { hasAccess, loading: permLoading } = useUserPermissions();
  const location = useLocation();
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return document.documentElement.classList.contains('dark');
  });

  const toggleDarkMode = () => {
    const root = document.documentElement;
    if (root.classList.contains('dark')) {
      root.classList.remove('dark');
      localStorage.setItem('hotel_pos_dark_mode', 'false');
      setIsDarkMode(false);
    } else {
      root.classList.add('dark');
      localStorage.setItem('hotel_pos_dark_mode', 'true');
      setIsDarkMode(true);
    }
    window.dispatchEvent(new CustomEvent('theme-changed'));
  };

  if (!profile) return null;

  const handleSignOut = async () => {
    setShowSignOutConfirm(false);
    await signOut();
  };

  // Super Admin doesn't need navigation - they only see Users page
  const isSuperAdmin = profile.role === 'super_admin';

  // Filter nav items based on permissions (empty for super_admin)
  const navItems = isSuperAdmin ? [] : (permLoading ? [] : ALL_NAV_ITEMS.filter(item => {
    if (!hasAccess(item.page)) return false;
    if (profile?.client_permissions && profile.client_permissions[item.to] === false) {
      return false;
    }
    return true;
  }));

  // Enable swipe gesture to open sidebar on mobile
  useSwipeGesture({
    onSwipeRight: () => {
      if (!isSuperAdmin) {
        setMobileMenuOpen(true);
      }
    },
    threshold: 50,
    edgeWidth: 30,
  });

  return (
    <>
      <header className="bg-card/80 backdrop-blur-lg border-b border-border/50 px-3 sm:px-6 py-2 sticky top-0 z-40">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            {/* Desktop/Tablet Sidebar Toggle Button */}
            {onToggleSidebar && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleSidebar}
                className="hidden md:flex h-9 w-9 text-muted-foreground hover:text-foreground rounded-xl"
                title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                <Menu className="h-5 w-5" />
              </Button>
            )}
            {/* Mobile Menu Button - Hidden for Super Admin */}
            {!isSuperAdmin && (
              <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="md:hidden h-9 w-9">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 p-0 flex flex-col">
                  <SheetHeader className="p-4 border-b bg-gradient-to-br from-primary/10 to-primary/5 shrink-0">
                    <SheetTitle className="flex items-center gap-2">
                      <div className="w-9 h-9 bg-gradient-to-br from-primary to-primary/80 rounded-xl flex items-center justify-center">
                        <Hotel className="h-5 w-5 text-primary-foreground" />
                      </div>
                      <div>
                        <div className="font-bold text-base">{profile.hotel_name || 'ZenPOS'}</div>
                        <div className="text-[10px] text-muted-foreground font-medium">Navigation Menu</div>
                      </div>
                    </SheetTitle>
                  </SheetHeader>
                  <nav className="flex-1 p-3 overflow-y-auto">
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
                              onClick={() => setMobileMenuOpen(false)}
                              className={cn(
                                "flex items-center px-4 py-3 rounded-lg transition-all duration-200",
                                isActive
                                  ? "bg-primary text-primary-foreground shadow-md"
                                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
                              )}
                            >
                              <Icon className="w-5 h-5 mr-3" />
                              <span className="font-medium">{displayLabel}</span>
                            </NavLink>
                          </li>
                        );
                      })}
                      <li>
                        <button
                          onClick={() => {
                            setMobileMenuOpen(false);
                            setSupportOpen(true);
                          }}
                          className="w-full flex items-center px-4 py-3 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all text-left"
                        >
                          <ShieldAlert className="w-5 h-5 mr-3 text-primary animate-pulse" />
                          <span className="font-semibold text-primary">Contact Support</span>
                        </button>
                      </li>
                    </ul>
                  </nav>
                </SheetContent>
              </Sheet>
            )}

            <div className="hidden sm:flex w-9 h-9 bg-gradient-to-br from-primary to-primary/80 rounded-xl items-center justify-center shadow-lg shadow-primary/20 shrink-0">
              <Hotel className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="shrink-0">
              <h1 className="font-bold text-base tracking-tight text-foreground">
                ZenPOS
              </h1>
              <p className="hidden sm:block text-[10px] text-muted-foreground font-medium tracking-wide uppercase">Management System</p>
            </div>
          </div>

          <div className="flex items-center space-x-1 sm:space-x-2 shrink-0">
            {!isSuperAdmin && <BranchSwitcher />}
            <LanguageSwitcher />

            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-xl hover:bg-muted/60 shrink-0"
              onClick={toggleDarkMode}
              title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {isDarkMode ? <Sun className="h-4 w-4 sm:h-5 sm:w-5 text-amber-500 animate-pulse" /> : <Moon className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-500 dark:text-indigo-400" />}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/20 text-destructive md:hidden shrink-0"
              onClick={() => setShowSignOutConfirm(true)}
              title={t('auth.signOut')}
            >
              <LogOut className="h-4.5 w-4.5 animate-pulse" />
            </Button>

            <Badge variant={profile.role === 'admin' || profile.role === 'super_admin' ? 'default' : 'outline'} className="hidden md:flex text-xs shrink-0">
              {profile.role === 'super_admin' ? 'Super Admin' : profile.role === 'admin' ? t('users.admin') : t('users.user')}
            </Badge>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="hidden md:flex items-center space-x-1 sm:space-x-2 h-10 px-1.5 sm:px-2 rounded-xl hover:bg-muted/60 shrink-0">
                  <div className="w-8 h-8 bg-gradient-to-br from-primary/20 to-primary/10 rounded-full flex items-center justify-center ring-2 ring-primary/20 shrink-0">
                    <User className="w-4 h-4 text-primary" />
                  </div>
                  <span className="hidden md:block text-sm font-medium">
                    {profile.name}
                  </span>
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-56 rounded-xl">
                <div className="px-3 py-2">
                  <p className="text-sm font-semibold">{profile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {profile.role === 'super_admin' ? 'Super Admin' : profile.role === 'admin' ? t('users.admin') : t('users.user')}
                  </p>
                </div>

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  onClick={() => setSupportOpen(true)}
                  className="cursor-pointer rounded-lg mx-1 font-semibold text-primary"
                >
                  <ShieldAlert className="w-4 h-4 mr-2 text-primary" />
                  Contact Support
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  onClick={() => setShowSignOutConfirm(true)}
                  className="text-destructive focus:text-destructive cursor-pointer rounded-lg mx-1"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  {t('auth.signOut')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Sign Out Confirmation Dialog */}
      <Dialog open={showSignOutConfirm} onOpenChange={setShowSignOutConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LogOut className="w-5 h-5 text-destructive" />
              {t('auth.signOutConfirm')}
            </DialogTitle>
            <DialogDescription>
              {t('auth.signOutDescription')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowSignOutConfirm(false)}
              className="flex-1 sm:flex-none"
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleSignOut}
              className="flex-1 sm:flex-none"
            >
              <LogOut className="w-4 h-4 mr-2" />
              {t('auth.signOut')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ContactSupportDialog open={supportOpen} onOpenChange={setSupportOpen} />
    </>
  );
};
