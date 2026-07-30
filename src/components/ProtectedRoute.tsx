import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import { useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

import type { UserPermissions } from '@/contexts/PermissionsContext';

interface ProtectedRouteProps {
    children: React.ReactNode;
    requiredPermission: keyof UserPermissions;
    adminOnly?: boolean;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
    children,
    requiredPermission,
    adminOnly = false
}) => {
    const { profile, loading: authLoading } = useAuth();
    const { hasAccess, loading: permLoading } = useUserPermissions();

    // Show loading while auth or permissions are loading
    if (authLoading || permLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    // Not logged in - redirect to auth
    if (!profile) {
        return <Navigate to="/auth" replace />;
    }

    // SUPER ADMIN: Can only access Users / Admin Management
    if (profile.role === 'super_admin') {
        if (requiredPermission !== 'users') {
            return <Navigate to="/super-admin/users" replace />;
        }
        return <>{children}</>;
    }

    // Admin-only page (like Users page) - super_admin already returned above
    if (adminOnly && profile.role !== 'admin') {
        return <Navigate to="/billing" replace />;
    }

    // Check permission for the page
    if (!hasAccess(requiredPermission)) {
        // Find the first page user has access to and redirect there
        const fallbackPages: (typeof requiredPermission)[] = ['billing', 'dashboard', 'items', 'expenses', 'reports', 'settings'];
        for (const page of fallbackPages) {
            if (hasAccess(page)) {
                return <Navigate to={`/${page === 'billing' ? '' : page}`} replace />;
            }
        }
        // If no access to anything, show a friendly access denied message instead of redirecting to /auth (which causes an infinite loop)
        return (
            <div className="min-h-screen flex items-center justify-center bg-background p-4">
                <div className="max-w-md w-full text-center space-y-4">
                    <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-2">
                        <ShieldAlert className="w-8 h-8 text-red-600 dark:text-red-500" />
                    </div>
                    <h2 className="text-2xl font-bold">Access Denied</h2>
                    <p className="text-muted-foreground">
                        You don't have permission to access this page, and no fallback pages are available. Please contact your administrator to assign permissions.
                    </p>
                    <div className="flex gap-4 justify-center mt-6">
                        <Button variant="outline" onClick={() => window.location.href = '/'}>Try Home</Button>
                        <Button 
                            variant="destructive" 
                            onClick={async () => {
                                const { supabase } = await import('@/integrations/supabase/client');
                                const { safeLocalStorage } = await import('@/utils/storageUtils');
                                await supabase.auth.signOut();
                                safeLocalStorage.clear();
                                window.location.href = '/auth';
                            }}
                        >
                            Sign Out
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    return <>{children}</>;
};
