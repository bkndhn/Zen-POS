
import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate, useLocation } from 'react-router-dom';
import { BottomNavigation } from './BottomNavigation';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { OfflineIndicator } from './OfflineIndicator';
import { PullToRefresh } from './PullToRefresh';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(() => {
    return localStorage.getItem('hotel_pos_sidebar_collapsed') === 'true';
  });

  // Don't show navigation on auth page
  if (location.pathname === '/auth') {
    return <>{children}</>;
  }

  // Show loading only while auth is being initialized
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // After loading is complete, check authentication
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!profile) {
    return <Navigate to="/auth" replace />;
  }

  if (profile.status !== 'active') {
    return <Navigate to="/auth" replace />;
  }

  const toggleSidebar = () => {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    localStorage.setItem('hotel_pos_sidebar_collapsed', next ? 'true' : 'false');
  };

  // User is properly authenticated with active profile
  return (
    <div className="h-screen h-[100dvh] bg-background flex w-full max-w-[100vw] overflow-hidden">
      <Sidebar collapsed={sidebarCollapsed} />

      <div className="flex flex-col flex-1 w-full min-w-0">
        <Header onToggleSidebar={toggleSidebar} sidebarCollapsed={sidebarCollapsed} />

        {/* Offline Status Indicator */}
        <div className="px-2 sm:px-4 py-1">
          <OfflineIndicator />
        </div>

        <main
          className="flex-1 relative w-full overflow-hidden"
          style={{ paddingBottom: 'max(80px, calc(70px + env(safe-area-inset-bottom, 0px)))' }}
        >
          <PullToRefresh>
            {children}
          </PullToRefresh>
        </main>

        <BottomNavigation />
      </div>
    </div>
  );
};
