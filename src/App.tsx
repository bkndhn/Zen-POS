
import React, { useState, useEffect, Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createIDBPersister } from './utils/queryPersister';
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { PermissionsProvider } from "@/contexts/PermissionsContext";
import { BranchProvider, useBranch } from "@/contexts/BranchContext";
import { Layout } from "@/components/Layout";
import { useWakeLock } from "@/hooks/useWakeLock";

const ThemeLoader = () => {
  const { operatingBranchId } = useBranch();

  useEffect(() => {
    const applyGlobalTheme = () => {
      const savedDarkMode = localStorage.getItem('hotel_pos_dark_mode');
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (savedDarkMode === 'true' || (savedDarkMode === null && prefersDark)) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }

      const themeKey = operatingBranchId ? `hotel_pos_theme_${operatingBranchId}` : 'hotel_pos_theme';
      const savedTheme = localStorage.getItem(themeKey) ?? localStorage.getItem('hotel_pos_theme') ?? 'blue';
      const customColorKey = operatingBranchId ? `hotel_pos_custom_color_${operatingBranchId}` : 'hotel_pos_custom_color';
      const customColor = localStorage.getItem(customColorKey) ?? localStorage.getItem('hotel_pos_custom_color') ?? '#0324fc';

      const themes = [
        { id: 'blue', class: '' },
        { id: 'blue-bright', class: 'theme-blue-bright' },
        { id: 'purple', class: 'theme-purple' },
        { id: 'green', class: 'theme-green' },
        { id: 'rose', class: 'theme-rose' },
        { id: 'sunset', class: 'theme-sunset' },
        { id: 'navy', class: 'theme-navy' },
        { id: 'hotpink', class: 'theme-hotpink' }
      ];

      const themeColors: Record<string, string> = {
        'blue': '#3b82f6',
        'blue-bright': '#0324fc',
        'purple': '#9333ea',
        'green': '#10b981',
        'rose': '#e11d48',
        'sunset': '#f97316',
        'navy': '#1e3a8a',
        'hotpink': '#c11c84'
      };

      const isDarkMode = savedDarkMode === 'true' || (savedDarkMode === null && prefersDark);
      if (isDarkMode) {
        document.documentElement.style.removeProperty('--primary');
        document.documentElement.style.removeProperty('--primary-foreground');
        document.documentElement.style.removeProperty('--primary-glow');
        document.documentElement.style.removeProperty('--ring');
        document.documentElement.style.removeProperty('--gradient-primary');
        document.documentElement.style.removeProperty('--sidebar-primary');
        document.documentElement.style.removeProperty('--sidebar-ring');
        document.documentElement.style.removeProperty('--btn-increment');
        document.documentElement.style.removeProperty('--qty-badge');

        themes.forEach(t => {
          if (t.class) document.documentElement.classList.remove(t.class);
        });

        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor) {
          metaThemeColor.setAttribute('content', '#09090b');
        }
        return;
      }

      if (savedTheme === 'custom') {
        const hexToHSL = (hex: string) => {
          const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
          if (!result) return { h: 0, s: 0, l: 0 };
          const r = parseInt(result[1], 16) / 255;
          const g = parseInt(result[2], 16) / 255;
          const b = parseInt(result[3], 16) / 255;
          const max = Math.max(r, g, b), min = Math.min(r, g, b);
          let h = 0, s = 0, l = (max + min) / 2;
          if (max !== min) {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
              case r: h = (g - b) / d + (g < b ? 6 : 0); break;
              case g: h = (b - r) / d + 2; break;
              case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
          }
          return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
        };

        const { h, s, l } = hexToHSL(customColor);
        const hslString = `${h} ${s}% ${l}%`;
        const glowString = `${h} ${Math.min(s + 5, 100)}% ${Math.min(l + 10, 95)}%`;

        themes.forEach(t => {
          if (t.class) document.documentElement.classList.remove(t.class);
        });

        document.documentElement.style.setProperty('--primary', hslString);
        document.documentElement.style.setProperty('--primary-foreground', '0 0% 100%');
        document.documentElement.style.setProperty('--primary-glow', glowString);
        document.documentElement.style.setProperty('--ring', hslString);
        document.documentElement.style.setProperty('--gradient-primary', `linear-gradient(135deg, hsl(${h} ${s}% ${l}%), hsl(${h} ${Math.max(s - 10, 0)}% ${Math.min(l + 5, 100)}%))`);

        document.documentElement.style.setProperty('--sidebar-primary', hslString);
        document.documentElement.style.setProperty('--sidebar-ring', hslString);
        document.documentElement.style.setProperty('--btn-increment', hslString);
        document.documentElement.style.setProperty('--qty-badge', hslString);

        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor) {
          metaThemeColor.setAttribute('content', customColor);
        }
      } else {
        document.documentElement.style.removeProperty('--primary');
        document.documentElement.style.removeProperty('--primary-foreground');
        document.documentElement.style.removeProperty('--primary-glow');
        document.documentElement.style.removeProperty('--ring');
        document.documentElement.style.removeProperty('--gradient-primary');
        document.documentElement.style.removeProperty('--sidebar-primary');
        document.documentElement.style.removeProperty('--sidebar-ring');
        document.documentElement.style.removeProperty('--btn-increment');
        document.documentElement.style.removeProperty('--qty-badge');

        themes.forEach(t => {
          if (t.class) document.documentElement.classList.remove(t.class);
        });

        if (savedTheme && savedTheme !== 'blue') {
          const themeClass = `theme-${savedTheme}`;
          document.documentElement.classList.add(themeClass);
        }

        const themeColor = themeColors[savedTheme] || '#3b82f6';
        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor) {
          metaThemeColor.setAttribute('content', themeColor);
        }
      }
    };

    applyGlobalTheme();

    // Listen for custom theme change events
    window.addEventListener('theme-changed', applyGlobalTheme);
    window.addEventListener('branch-changed', applyGlobalTheme);
    return () => {
      window.removeEventListener('theme-changed', applyGlobalTheme);
      window.removeEventListener('branch-changed', applyGlobalTheme);
    };
  }, [operatingBranchId]);

  return null;
};

// Keep Auth as direct import for instant login screen
import Auth from "./pages/Auth";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PendingBillsQueue } from "./components/PendingBillsQueue";

// Lazy-loaded pages — each becomes its own chunk
const Dashboard = lazy(() => import("./pages/Dashboard"));
const DashboardAnalytics = lazy(() => import("./pages/DashboardAnalytics"));
const Billing = lazy(() => import("./pages/Billing"));
const Items = lazy(() => import("./pages/Items"));
const Expenses = lazy(() => import("./pages/Expenses"));
const Users = lazy(() => import("./pages/Users"));
const Reports = lazy(() => import("./pages/Reports"));
const Settings = lazy(() => import("./pages/Settings"));
const NotFound = lazy(() => import("./pages/NotFound"));
const ServiceArea = lazy(() => import("./pages/ServiceArea"));
const KitchenDisplay = lazy(() => import("./pages/KitchenDisplay"));
const CustomerDisplay = lazy(() => import("./pages/CustomerDisplay"));
const TableManagement = lazy(() => import("./pages/TableManagement"));
const CRM = lazy(() => import("./pages/CRM"));
const PublicMenu = lazy(() => import("./pages/PublicMenu"));
const QRMenu = lazy(() => import("./pages/QRMenu"));
const TableOrderBilling = lazy(() => import("./pages/TableOrderBilling"));
const WaiterCompanion = lazy(() => import("./pages/WaiterCompanion"));
const LandingPage = lazy(() => import("./pages/LandingPage"));
const DemoBilling = lazy(() => import("./pages/DemoBilling"));
const SuperAdminUsers = lazy(() => import("./pages/SuperAdminUsers"));
const Suppliers = lazy(() => import("./pages/Suppliers"));
const Purchases = lazy(() => import("./pages/Purchases"));
const StockManagement = lazy(() => import("./pages/StockManagement"));
const StockReports = lazy(() => import("./pages/StockReports"));
const StockTransfers = lazy(() => import("./pages/StockTransfers"));
const PurchaseReturns = lazy(() => import("./pages/PurchaseReturns"));
const StockLedger = lazy(() => import("./pages/StockLedger"));
const StockAdjustment = lazy(() => import("./pages/StockAdjustment"));
const MenuTV = lazy(() => import("./pages/MenuTV").then(m => ({ default: m.MenuTV })));
const ImageDiagnostics = lazy(() => import("./pages/ImageDiagnostics"));
const AiInsights = lazy(() => import("./pages/AiInsights"));
const SuperAdminRum = lazy(() => import("./pages/SuperAdminRum"));
const PublicFeedback = lazy(() => import("./pages/PublicFeedback"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 60 * 24, // 24 hours for offline mode
      gcTime: 1000 * 60 * 60 * 24 * 7, // 7 days cache retention
      retry: 1, // Fewer retries for faster perceived failure
      refetchOnWindowFocus: false,
      refetchOnMount: false, // Don't refetch on every mount
      networkMode: 'offlineFirst', // CRITICAL: Allow queries to run offline
    },
  },
});

const persister = createIDBPersister();
// Bump this version any time cached query shapes change, so old IndexedDB
// snapshots get thrown out on next load instead of hydrating broken data.
const PERSIST_BUSTER = 'v3-2026-07';

import { InstallPrompt } from './components/InstallPrompt';
import { DevicePermissions } from './components/DevicePermissions';
import { NativeAppController } from './components/NativeAppController';

const App = () => {
  // Always On Display State
  const [aodEnabled, setAodEnabled] = useState(() => {
    const saved = localStorage.getItem('hotel_pos_aod_enabled');
    return saved === null ? true : saved === 'true';
  });

  // Keep the screen awake based on preference
  useWakeLock(aodEnabled);

  // Listen for AOD preference changes
  useEffect(() => {
    const handleAodChange = (e: CustomEvent) => {
      setAodEnabled(e.detail);
    };
    window.addEventListener('aod-changed', handleAodChange as EventListener);
    return () => window.removeEventListener('aod-changed', handleAodChange as EventListener);
  }, []);

  // Listen for Font Scale changes
  useEffect(() => {
    const handleFontScaleChange = (e: CustomEvent) => {
      document.documentElement.style.setProperty('--app-font-scale', e.detail);
    };
    window.addEventListener('font-scale-changed', handleFontScaleChange as EventListener);

    // Apply saved font scale on startup
    const savedScale = localStorage.getItem('hotel_pos_font_scale') || '1';
    document.documentElement.style.setProperty('--app-font-scale', savedScale);

    return () => window.removeEventListener('font-scale-changed', handleFontScaleChange as EventListener);
  }, []);

  // Global cache invalidation listeners (theme is handled by ThemeLoader)
  React.useEffect(() => {
    const handleInvalidateBills = () => {
      console.log('Global: Invalidating bills cache');
      import('@/utils/cacheUtils').then(({ invalidateRelatedData }) => {
        invalidateRelatedData('bills');
      });
    };

    const handleInvalidateItems = () => {
      console.log('Global: Invalidating items cache');
      import('@/utils/cacheUtils').then(({ invalidateRelatedData }) => {
        invalidateRelatedData('items');
      });
    };

    const handleInvalidatePayments = () => {
      console.log('Global: Invalidating payments cache');
      import('@/utils/cacheUtils').then(({ invalidateRelatedData }) => {
        invalidateRelatedData('payments');
      });
    };

    const handleInvalidateExpenses = () => {
      console.log('Global: Invalidating expenses cache');
      import('@/utils/cacheUtils').then(({ invalidateRelatedData }) => {
        invalidateRelatedData('expenses');
      });
    };

    window.addEventListener('bills-updated', handleInvalidateBills);
    window.addEventListener('items-updated', handleInvalidateItems);
    window.addEventListener('payment-types-updated', handleInvalidatePayments);
    window.addEventListener('expenses-updated', handleInvalidateExpenses);

    return () => {
      window.removeEventListener('bills-updated', handleInvalidateBills);
      window.removeEventListener('items-updated', handleInvalidateItems);
      window.removeEventListener('payment-types-updated', handleInvalidatePayments);
      window.removeEventListener('expenses-updated', handleInvalidateExpenses);
    };
  }, []);

  return (
    <ErrorBoundary>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: 1000 * 60 * 60 * 24 * 7, // 7d — matches gcTime
          buster: PERSIST_BUSTER,
          dehydrateOptions: {
            // Only persist successful queries; skip errored / paused ones so
            // a bad network moment can't poison IndexedDB.
            shouldDehydrateQuery: (q) => q.state.status === 'success',
          },
        }}
      >
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <InstallPrompt />
          <DevicePermissions />
          <PendingBillsQueue />
          <BrowserRouter>
            <NativeAppController />
            <AuthProvider>
              <PermissionsProvider>
                <BranchProvider>
                  <ThemeLoader />
                  <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>}>
                  <Routes>
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/" element={<Layout><ProtectedRoute requiredPermission="billing"><Billing /></ProtectedRoute></Layout>} />
                  <Route path="/dashboard" element={<Layout><ProtectedRoute requiredPermission="dashboard"><Dashboard /></ProtectedRoute></Layout>} />
                  <Route path="/analytics" element={<Layout><ProtectedRoute requiredPermission="analytics"><DashboardAnalytics /></ProtectedRoute></Layout>} />
                  <Route path="/billing" element={<Layout><ProtectedRoute requiredPermission="billing"><Billing /></ProtectedRoute></Layout>} />
                  <Route path="/items" element={<Layout><ProtectedRoute requiredPermission="items"><Items /></ProtectedRoute></Layout>} />
                  <Route path="/expenses" element={<Layout><ProtectedRoute requiredPermission="expenses"><Expenses /></ProtectedRoute></Layout>} />
                  <Route path="/reports" element={<Layout><ProtectedRoute requiredPermission="reports"><Reports /></ProtectedRoute></Layout>} />
                  <Route path="/users" element={<Layout><ProtectedRoute requiredPermission="users" adminOnly><Users /></ProtectedRoute></Layout>} />
                  <Route path="/settings" element={<Layout><ProtectedRoute requiredPermission="settings"><Settings /></ProtectedRoute></Layout>} />
                  <Route path="/service-area" element={<Layout><ProtectedRoute requiredPermission="serviceArea"><ServiceArea /></ProtectedRoute></Layout>} />
                  <Route path="/kitchen" element={<Layout><ProtectedRoute requiredPermission="kitchen"><KitchenDisplay /></ProtectedRoute></Layout>} />
                  <Route path="/tables" element={<Layout><ProtectedRoute requiredPermission="tables"><TableManagement /></ProtectedRoute></Layout>} />
                  <Route path="/crm" element={<Layout><ProtectedRoute requiredPermission="settings"><CRM /></ProtectedRoute></Layout>} />
                  <Route path="/qr-menu" element={<Layout><ProtectedRoute requiredPermission="qrMenu"><QRMenu /></ProtectedRoute></Layout>} />
                  <Route path="/table-billing" element={<Layout><ProtectedRoute requiredPermission="tableBilling"><TableOrderBilling /></ProtectedRoute></Layout>} />
                  <Route path="/waiter" element={<Layout><ProtectedRoute requiredPermission="waiterCompanion"><WaiterCompanion /></ProtectedRoute></Layout>} />
                  <Route path="/suppliers" element={<Layout><ProtectedRoute requiredPermission="suppliers"><Suppliers /></ProtectedRoute></Layout>} />
                  <Route path="/purchases" element={<Layout><ProtectedRoute requiredPermission="purchases"><Purchases /></ProtectedRoute></Layout>} />
                  <Route path="/stock" element={<Layout><ProtectedRoute requiredPermission="stock"><StockManagement /></ProtectedRoute></Layout>} />
                  <Route path="/stock-reports" element={<Layout><ProtectedRoute requiredPermission="stock"><StockReports /></ProtectedRoute></Layout>} />
                  <Route path="/stock-transfers" element={<Layout><ProtectedRoute requiredPermission="stock"><StockTransfers /></ProtectedRoute></Layout>} />
                  <Route path="/purchase-returns" element={<Layout><ProtectedRoute requiredPermission="purchases"><PurchaseReturns /></ProtectedRoute></Layout>} />
                  <Route path="/stock-ledger" element={<Layout><ProtectedRoute requiredPermission="stock"><StockLedger /></ProtectedRoute></Layout>} />
                  <Route path="/stock-adjustment" element={<Layout><ProtectedRoute requiredPermission="stock"><StockAdjustment /></ProtectedRoute></Layout>} />
                  <Route path="/super-admin/users" element={<Layout><SuperAdminUsers /></Layout>} />
                  <Route path="/super-admin/rum" element={<Layout><SuperAdminRum /></Layout>} />
                  <Route path="/diagnostics/images" element={<Layout><ProtectedRoute requiredPermission="settings"><ImageDiagnostics /></ProtectedRoute></Layout>} />
                  <Route path="/ai-insights" element={<Layout><ProtectedRoute requiredPermission="analytics"><AiInsights /></ProtectedRoute></Layout>} />
                  <Route path="/display" element={<CustomerDisplay />} />
                  <Route path="/menu/:adminId" element={<PublicMenu />} />
                  <Route path="/landing" element={<LandingPage />} />
                  <Route path="/demo" element={<DemoBilling />} />
                  <Route path="/menu-tv/:adminId" element={<MenuTV />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
                </Suspense>
                </BranchProvider>
              </PermissionsProvider>
            </AuthProvider>
          </BrowserRouter>
        </TooltipProvider>
        </PersistQueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
