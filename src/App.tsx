
import React, { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { PermissionsProvider } from "@/contexts/PermissionsContext";
import { BranchProvider } from "@/contexts/BranchContext";
import { Layout } from "@/components/Layout";
import { useWakeLock } from "@/hooks/useWakeLock";

// Direct imports for faster navigation (no lazy loading overhead)
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import DashboardAnalytics from "./pages/DashboardAnalytics";
import Billing from "./pages/Billing";
import Items from "./pages/Items";
import Expenses from "./pages/Expenses";
import Users from "./pages/Users";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import ServiceArea from "./pages/ServiceArea";
import KitchenDisplay from "./pages/KitchenDisplay";
import CustomerDisplay from "./pages/CustomerDisplay";
import TableManagement from "./pages/TableManagement";
import CRM from "./pages/CRM";
import PublicMenu from "./pages/PublicMenu";
import QRMenu from "./pages/QRMenu";
import TableOrderBilling from "./pages/TableOrderBilling";
import LandingPage from "./pages/LandingPage";
import DemoBilling from "./pages/DemoBilling";
import SuperAdminUsers from "./pages/SuperAdminUsers";
import Suppliers from "./pages/Suppliers";
import Purchases from "./pages/Purchases";
import StockManagement from "./pages/StockManagement";
import StockReports from "./pages/StockReports";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PendingBillsQueue } from "./components/PendingBillsQueue";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes - longer cache
      gcTime: 1000 * 60 * 30, // 30 minutes cache retention
      retry: 1, // Fewer retries for faster perceived failure
      refetchOnWindowFocus: false,
      refetchOnMount: false, // Don't refetch on every mount
    },
  },
});

import { InstallPrompt } from './components/InstallPrompt';
import { DevicePermissions } from './components/DevicePermissions';

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

  // Theme colors for status bar (meta theme-color)
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

  // Helper to apply custom theme variables
  const applyCustomTheme = (color: string) => {
    // Simple Hex to HSL conversion
    const hexToHSL = (hex: string) => {
      let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      if (!result) return { h: 0, s: 0, l: 0 };
      let r = parseInt(result[1], 16) / 255;
      let g = parseInt(result[2], 16) / 255;
      let b = parseInt(result[3], 16) / 255;
      let max = Math.max(r, g, b), min = Math.min(r, g, b);
      let h = 0, s = 0, l = (max + min) / 2;
      if (max !== min) {
        let d = max - min;
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

    const { h, s, l } = hexToHSL(color);
    const hslString = `${h} ${s}% ${l}%`;
    const glowString = `${h} ${Math.min(s + 5, 100)}% ${Math.min(l + 10, 95)}%`;

    document.documentElement.style.setProperty('--primary', hslString);
    document.documentElement.style.setProperty('--primary-foreground', '0 0% 100%');
    document.documentElement.style.setProperty('--primary-glow', glowString);
    document.documentElement.style.setProperty('--ring', hslString);
    document.documentElement.style.setProperty('--gradient-primary', `linear-gradient(135deg, hsl(${h} ${s}% ${l}%), hsl(${h} ${Math.max(s - 10, 0)}% ${Math.min(l + 5, 100)}%))`);

    // Sidebar and Buttons
    document.documentElement.style.setProperty('--sidebar-primary', hslString);
    document.documentElement.style.setProperty('--sidebar-ring', hslString);
    document.documentElement.style.setProperty('--btn-increment', hslString);
    document.documentElement.style.setProperty('--qty-badge', hslString);
  };

  // Global cache invalidation listeners and theme initialization
  React.useEffect(() => {
    // Apply saved theme on startup
    const savedTheme = localStorage.getItem('hotel_pos_theme') || 'blue';

    if (savedTheme === 'custom') {
      const customColor = localStorage.getItem('hotel_pos_custom_color') || '#0324fc';
      applyCustomTheme(customColor);

      // Update meta tag
      let metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (metaThemeColor) {
        metaThemeColor.setAttribute('content', customColor);
      }
    } else {
      // Clean up custom styles if switching from custom
      document.documentElement.style.removeProperty('--primary');
      document.documentElement.style.removeProperty('--primary-foreground');

      // Apply theme class
      if (savedTheme && savedTheme !== 'blue') {
        const themeClass = `theme-${savedTheme}`;
        document.documentElement.classList.add(themeClass);
      }

      // Apply theme-color meta tag for status bar
      const themeColor = themeColors[savedTheme] || '#3b82f6';
      let metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (metaThemeColor) {
        metaThemeColor.setAttribute('content', themeColor);
      } else {
        metaThemeColor = document.createElement('meta');
        metaThemeColor.setAttribute('name', 'theme-color');
        metaThemeColor.setAttribute('content', themeColor);
        document.head.appendChild(metaThemeColor);
      }
    }

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
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <InstallPrompt />
          <DevicePermissions />
          <PendingBillsQueue />
          <BrowserRouter>
            <AuthProvider>
              <PermissionsProvider>
                <BranchProvider>
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
                  <Route path="/suppliers" element={<Layout><ProtectedRoute requiredPermission="suppliers"><Suppliers /></ProtectedRoute></Layout>} />
                  <Route path="/purchases" element={<Layout><ProtectedRoute requiredPermission="purchases"><Purchases /></ProtectedRoute></Layout>} />
                  <Route path="/stock" element={<Layout><ProtectedRoute requiredPermission="stock"><StockManagement /></ProtectedRoute></Layout>} />
                  <Route path="/stock-reports" element={<Layout><ProtectedRoute requiredPermission="stock"><StockReports /></ProtectedRoute></Layout>} />
                  <Route path="/super-admin/users" element={<Layout><SuperAdminUsers /></Layout>} />
                  <Route path="/display" element={<CustomerDisplay />} />
                  <Route path="/menu/:adminId" element={<PublicMenu />} />
                  <Route path="/landing" element={<LandingPage />} />
                  <Route path="/demo" element={<DemoBilling />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
                </BranchProvider>
              </PermissionsProvider>
            </AuthProvider>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
