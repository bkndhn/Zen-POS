import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useUserPermissions } from '@/hooks/useUserPermissions';
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
        // If no access to anything, redirect to auth
        return <Navigate to="/auth" replace />;
    }

    return <>{children}</>;
};
