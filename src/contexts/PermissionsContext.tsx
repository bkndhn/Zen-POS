import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface UserPermissions {
    dashboard: boolean;
    billing: boolean;
    items: boolean;
    expenses: boolean;
    reports: boolean;
    analytics: boolean;
    settings: boolean;
    users: boolean;
    serviceArea: boolean;
    kitchen: boolean;
    customerDisplay: boolean;
    tables: boolean;
    customers: boolean;
    qrMenu: boolean;
    tableBilling: boolean;
    suppliers: boolean;
    purchases: boolean;
    stock: boolean;
    waiterCompanion: boolean;
}

const DEFAULT_PERMISSIONS: UserPermissions = {
    dashboard: false,
    billing: false,
    items: false,
    expenses: false,
    reports: false,
    analytics: false,
    settings: false,
    users: false,
    serviceArea: false,
    kitchen: false,
    customerDisplay: false,
    tables: false,
    customers: false,
    qrMenu: false,
    tableBilling: false,
    suppliers: false,
    purchases: false,
    stock: false,
    waiterCompanion: false,
};

const ADMIN_PERMISSIONS: UserPermissions = {
    dashboard: true,
    billing: true,
    items: true,
    expenses: true,
    reports: true,
    analytics: true,
    settings: true,
    users: true,
    serviceArea: true,
    kitchen: true,
    customerDisplay: true,
    tables: true,
    customers: true,
    qrMenu: true,
    tableBilling: true,
    suppliers: true,
    purchases: true,
    stock: true,
    waiterCompanion: true,
};

interface PermissionsContextType {
    permissions: UserPermissions;
    loading: boolean;
    hasAccess: (page: keyof UserPermissions) => boolean;
    refetch: () => void;
}

const PermissionsContext = createContext<PermissionsContextType | undefined>(undefined);

export const PermissionsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { profile, loading: authLoading } = useAuth();
    const [permissions, setPermissions] = useState<UserPermissions>(DEFAULT_PERMISSIONS);
    const [loading, setLoading] = useState(true);
    const fetchedForUserRef = useRef<string | null>(null);

    const fetchPermissions = useCallback(async () => {
        if (authLoading) return;

        if (!profile?.user_id) {
            setPermissions(DEFAULT_PERMISSIONS);
            setLoading(false);
            return;
        }

        // Super Admin gets all permissions
        if (profile.role === 'super_admin') {
            setPermissions(ADMIN_PERMISSIONS);
            setLoading(false);
            fetchedForUserRef.current = profile.user_id;
            return;
        }

        // Already fetched for this user
        if (fetchedForUserRef.current === profile.user_id) {
            return;
        }

        try {
            // For ADMIN: Check their own permissions set by Super Admin
            // For USER (child): Check their own permissions AND their parent admin's permissions

            let adminPermissions: Record<string, boolean> = {};
            let userPermissions: Record<string, boolean> = {};

            // If this is an admin, fetch their permissions
            if (profile.role === 'admin') {
                const { data, error } = await supabase
                    .from('user_permissions')
                    .select('page_name, has_access')
                    .eq('user_id', profile.user_id);

                if (!error && data) {
                    for (const row of data) {
                        adminPermissions[row.page_name] = row.has_access === true;
                    }
                }

                // Check if admin has QR Menu access (premium feature)
                const { data: profileData } = await supabase
                    .from('profiles')
                    .select('has_qr_menu_access')
                    .eq('user_id', profile.user_id)
                    .maybeSingle();

                const hasQrMenuAccess = profileData?.has_qr_menu_access ?? false;

                // Build permissions - admin has access unless Super Admin disabled it
                const perms = { ...ADMIN_PERMISSIONS };

                // Apply QR Menu premium feature check
                perms.qrMenu = hasQrMenuAccess;

                for (const [page, allowed] of Object.entries(adminPermissions)) {
                    if (page in perms && allowed === false) {
                        (perms as any)[page] = false;
                    }
                }

                setPermissions(perms);
                fetchedForUserRef.current = profile.user_id;
                setLoading(false);
                return;
            }


            // For child users: need to check BOTH their own permissions AND parent admin's
            if (profile.role === 'user' && profile.admin_id) {
                // First, get parent admin's user_id and has_qr_menu_access
                const { data: adminData } = await supabase
                    .from('profiles')
                    .select('user_id, has_qr_menu_access')
                    .eq('id', profile.admin_id)
                    .single();

                let adminHasQrMenuAccess = false;

                if (adminData?.user_id) {
                    adminHasQrMenuAccess = (adminData as any).has_qr_menu_access ?? false;

                    const { data: adminPermsData } = await supabase
                        .from('user_permissions')
                        .select('page_name, has_access')
                        .eq('user_id', adminData.user_id);

                    if (adminPermsData) {
                        for (const row of adminPermsData) {
                            adminPermissions[row.page_name] = row.has_access === true;
                        }
                    }
                }

                // Then get the child user's own permissions (set by Admin)
                const { data: userPermsData, error } = await supabase.rpc('get_my_permissions');

                if (!error && userPermsData) {
                    for (const row of userPermsData) {
                        userPermissions[row.page_name] = row.has_access === true;
                    }
                } else {
                    // Fallback: direct query
                    const { data: directData } = await supabase
                        .from('user_permissions')
                        .select('page_name, has_access')
                        .eq('user_id', profile.user_id);

                    if (directData) {
                        for (const row of directData) {
                            userPermissions[row.page_name] = row.has_access === true;
                        }
                    }
                }

                // Build final permissions: 
                // Child has access ONLY if BOTH admin has access AND child has access
                const perms = { ...DEFAULT_PERMISSIONS };

                for (const pageName of Object.keys(DEFAULT_PERMISSIONS)) {
                    // Check if admin has this page blocked (explicitly set to false)
                    const adminBlocked = adminPermissions[pageName] === false;
                    // Check if child has access
                    const childHasAccess = userPermissions[pageName] === true;

                    // Child gets access only if admin hasn't blocked AND child is allowed
                    (perms as any)[pageName] = !adminBlocked && childHasAccess;
                }

                // QR Menu: child can only have access if parent admin has premium access
                perms.qrMenu = adminHasQrMenuAccess && (userPermissions['qrMenu'] === true);

                setPermissions(perms);
                fetchedForUserRef.current = profile.user_id;
                setLoading(false);
                return;
            }


            // Default: no permissions for unlinked users
            setPermissions(DEFAULT_PERMISSIONS);
            setLoading(false);
        } catch (err) {
            console.error('[Permissions] Error:', err);
            setPermissions(DEFAULT_PERMISSIONS);
            setLoading(false);
        }
    }, [profile?.user_id, profile?.role, profile?.admin_id, authLoading]);

    useEffect(() => {
        fetchPermissions();
    }, [fetchPermissions]);

    useEffect(() => {
        if (profile?.user_id && profile.user_id !== fetchedForUserRef.current) {
            setLoading(true);
            fetchedForUserRef.current = null;
        }
    }, [profile?.user_id]);

    // === REALTIME SUBSCRIPTION FOR INSTANT PERMISSION UPDATES ===
    useEffect(() => {
        if (!profile?.user_id || profile.role === 'super_admin') {
            return;
        }

        console.log('[Permissions] Setting up realtime subscriptions for user:', profile.user_id, 'role:', profile.role);

        const pageToRoute: Record<string, string> = {
            dashboard: '/dashboard',
            billing: '/billing',
            items: '/items',
            expenses: '/expenses',
            reports: '/reports',
            analytics: '/analytics',
            settings: '/settings',
            users: '/users',
            serviceArea: '/service-area',
            kitchen: '/kitchen',
            customerDisplay: '/customer-display',
            tables: '/tables',
            customers: '/crm',
            qrMenu: '/qr-menu',
            tableBilling: '/table-billing',
            suppliers: '/suppliers',
            purchases: '/purchases',
            stock: '/stock',
            waiterCompanion: '/waiter',
        };

        const handlePermissionChange = (userId: string, pageName: string, hasAccess: boolean) => {
            // Only process if this is for the current user
            if (userId !== profile.user_id) {
                console.log('[Permissions] Ignoring update for different user:', userId);
                return;
            }

            console.log(`[Permissions] Page ${pageName} access changed to:`, hasAccess);

            setPermissions(prev => {
                const updated = { ...prev };
                if (pageName in updated) {
                    (updated as any)[pageName] = hasAccess;

                    // If access was revoked, check if user is on that page and redirect
                    if (hasAccess === false) {
                        const currentPath = window.location.pathname;
                        const blockedPath = pageToRoute[pageName];

                        if (blockedPath && currentPath === blockedPath) {
                            console.log('[Permissions] User on blocked page, redirecting...');
                            // Find first allowed page to redirect to
                            const firstAllowedPage = Object.entries(updated).find(([_, allowed]) => allowed);
                            if (firstAllowedPage) {
                                const redirectPath = pageToRoute[firstAllowedPage[0]] || '/';
                                window.location.href = redirectPath;
                            } else {
                                // No pages allowed, redirect to auth
                                window.location.href = '/auth';
                            }
                        }
                    }
                }
                return updated;
            });
        };

        // Handle when parent admin's permission changes (cascade to child users)
        const handleAdminPermissionChange = (childUserId: string, pageName: string, adminHasAccess: boolean) => {
            // Only process if this is for the current user (child user)
            if (childUserId !== profile.user_id) {
                console.log('[Permissions] Admin change not for this user:', childUserId);
                return;
            }

            console.log(`[Permissions] Parent admin permission changed for ${pageName}:`, adminHasAccess);

            // If admin lost access, child also loses access (regardless of child's own permission)
            if (adminHasAccess === false) {
                setPermissions(prev => {
                    const updated = { ...prev };
                    if (pageName in updated && (updated as any)[pageName] === true) {
                        console.log(`[Permissions] Revoking ${pageName} access due to admin block`);
                        (updated as any)[pageName] = false;

                        // Check if user is on that page and redirect
                        const currentPath = window.location.pathname;
                        const blockedPath = pageToRoute[pageName];

                        if (blockedPath && currentPath === blockedPath) {
                            console.log('[Permissions] User on admin-blocked page, redirecting...');
                            const firstAllowedPage = Object.entries(updated).find(([_, allowed]) => allowed);
                            if (firstAllowedPage) {
                                const redirectPath = pageToRoute[firstAllowedPage[0]] || '/';
                                window.location.href = redirectPath;
                            } else {
                                window.location.href = '/auth';
                            }
                        }
                    }
                    return updated;
                });
            } else {
                // Admin regained access - refetch permissions to see if child also has access
                console.log('[Permissions] Admin regained access, refetching permissions...');
                fetchedForUserRef.current = null;
                fetchPermissions();
            }
        };

        // Supabase Broadcast Listeners
        const broadcastChannel = supabase
            .channel('permissions-broadcast')
            .on('broadcast', { event: 'permission-changed' }, (payload) => {
                console.log('[Permissions] Broadcast received:', payload);
                const { user_id, page_name, has_access } = payload.payload || {};
                if (user_id && page_name !== undefined) {
                    handlePermissionChange(user_id, page_name, has_access);
                }
            })
            .on('broadcast', { event: 'admin-permission-changed' }, (payload) => {
                console.log('[Permissions] Admin permission cascade received:', payload);
                const { child_user_id, page_name, admin_has_access } = payload.payload || {};
                if (child_user_id && page_name !== undefined) {
                    handleAdminPermissionChange(child_user_id, page_name, admin_has_access);
                }
            })
            .subscribe((status) => {
                console.log('[Permissions] Broadcast subscription status:', status);
            });

        // postgres_changes (backup, ~2-5s)
        const dbChannel = supabase
            .channel(`permissions-db-${profile.user_id}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'user_permissions',
                    filter: `user_id=eq.${profile.user_id}`
                },
                (payload) => {
                    console.log('[Permissions] DB change received:', payload);
                    const { eventType, new: newRow, old: oldRow } = payload;

                    if (eventType === 'UPDATE' || eventType === 'INSERT') {
                        const row = newRow as any;
                        if (row.page_name) {
                            handlePermissionChange(row.user_id, row.page_name, row.has_access === true);
                        }
                    } else if (eventType === 'DELETE') {
                        const row = oldRow as any;
                        if (row.page_name) {
                            handlePermissionChange(row.user_id, row.page_name, false);
                        }
                    }
                }
            )
            .subscribe((status) => {
                console.log('[Permissions] DB subscription status:', status);
            });

        return () => {
            console.log('[Permissions] Cleaning up realtime subscriptions');
            supabase.removeChannel(broadcastChannel);
            supabase.removeChannel(dbChannel);
        };
    }, [profile?.user_id, profile?.role, fetchPermissions]);

    const hasAccess = useCallback((page: keyof UserPermissions): boolean => {
        if (profile?.role === 'super_admin') {
            // Super Admin sees every page — including any newly added ones.
            // The dev-time assertion below guarantees no nav item is missed.
            return true;
        }
        // For admin, check from permissions state (which may have been blocked by super admin)
        // For child users, permissions already cascade-checked
        return permissions[page] === true;
    }, [profile?.role, permissions]);

    // Dev-time safety check: warn loudly if any nav item references a page key
    // that the permissions map doesn't know about. Prevents "newly added pages
    // missing from Super Admin / Users permissions" regressions.
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if ((import.meta as any)?.env?.PROD) return;
        import('@/config/navItems').then(({ ALL_NAV_ITEMS }) => {
            const known = new Set(Object.keys(DEFAULT_PERMISSIONS));
            const missing = ALL_NAV_ITEMS
                .map(i => i.page as string)
                .filter(k => !known.has(k));
            if (missing.length) {
                console.warn(
                    '[PermissionsContext] navItems references unknown permission keys:',
                    Array.from(new Set(missing)),
                    '\nAdd them to UserPermissions / DEFAULT_PERMISSIONS / ADMIN_PERMISSIONS.'
                );
            }
        }).catch(() => {});
    }, []);


    const refetch = useCallback(() => {
        fetchedForUserRef.current = null;
        setLoading(true);
        fetchPermissions();
    }, [fetchPermissions]);

    return (
        <PermissionsContext.Provider value={{ permissions, loading, hasAccess, refetch }}>
            {children}
        </PermissionsContext.Provider>
    );
};

export const usePermissions = (): PermissionsContextType => {
    const context = useContext(PermissionsContext);
    if (!context) {
        throw new Error('usePermissions must be used within a PermissionsProvider');
    }
    return context;
};

export const useUserPermissions = (): PermissionsContextType => {
    return usePermissions();
};
