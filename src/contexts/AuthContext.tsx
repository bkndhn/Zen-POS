import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Profile, UserStatus, UserRole } from '@/types/user';
import { seedAdminDefaults } from '@/utils/seedAdminDefaults';

const isDev = import.meta.env.DEV;
const devLog = (...args: any[]) => { if (isDev) console.log(...args); };


interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signUp: (
    email: string,
    password: string,
    name: string,
    role?: string,
    hotelName?: string,
    adminId?: string,
    extras?: { mobileNumber?: string; shopName?: string; address?: string }
  ) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const createBasicProfile = (user: User): Profile => {
    // SECURITY: Never trust user_metadata for role — always default to 'user'
    // The actual role is fetched from the database (profiles table)
    return {
      id: user.id,
      user_id: user.id,
      name: user.user_metadata?.name || user.email?.split('@')[0] || 'User',
      role: 'user' as UserRole,
      hotel_name: user.user_metadata?.hotel_name,
      status: 'active' as UserStatus,
      admin_id: user.user_metadata?.admin_id
    };
  };

  const fetchOrCreateProfile = async (user: User): Promise<Profile> => {
    try {
      devLog('Fetching profile for user:', user.id);

      // 1. Try to get from localStorage first (fastest & works offline)
      const cachedProfileStr = localStorage.getItem(`profile_${user.id}`);
      let cachedProfile: Profile | null = null;

      if (cachedProfileStr) {
        try {
          cachedProfile = JSON.parse(cachedProfileStr);
          // If we have a cached profile, we can return it immediately if we're offline
          // or we can use it as a fallback if the network request fails
          if (!navigator.onLine && cachedProfile) {
            devLog('Using cached profile (offline)');
            return cachedProfile;
          }
        } catch (e) {
          console.error('Error parsing cached profile:', e);
        }
      }

      // 2. Try to fetch existing profile from Supabase with a timeout
      const profilePromise = supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Profile fetch timeout')), 5000)
      );

      let existingProfile = null;
      let fetchError = null;

      try {
        const result: any = await Promise.race([
          profilePromise,
          timeoutPromise
        ]);
        existingProfile = result.data;
        fetchError = result.error;
      } catch (e) {
        devLog('Network request failed or timed out');
        // If network fails and we have cache, RETURN CACHE
        if (cachedProfile) {
          devLog('Network failed, using cached profile');
          return cachedProfile;
        }
      }

      if (!fetchError && existingProfile) {
        devLog('Found existing profile');

        // For sub-users, fetch parent admin's hotel name if not set
        let hotelName = existingProfile.hotel_name;
        if (!hotelName && existingProfile.admin_id && existingProfile.role === 'user') {
          try {
            const { data: adminData } = await supabase
              .from('profiles')
              .select('hotel_name')
              .eq('id', existingProfile.admin_id)
              .single();
            if (adminData?.hotel_name) {
              hotelName = adminData.hotel_name;
              devLog('Inherited hotel name from admin');
            }
          } catch (e) {
            devLog('Could not fetch admin hotel name');
          }
        }

        // Load client permissions (admins fetch from their own profile, sub-users inherit from parent admin)
        let clientPermissions = undefined;
        if (existingProfile.role === 'user' && existingProfile.admin_id) {
          try {
            const { data: adminData } = await supabase
              .from('profiles')
              .select('client_permissions')
              .eq('id', existingProfile.admin_id)
              .single();
            if (adminData) {
              clientPermissions = (adminData as any).client_permissions || undefined;
            }
          } catch (e) {
            devLog('Could not fetch admin client permissions');
          }
        } else {
          clientPermissions = (existingProfile as any).client_permissions || undefined;
        }

        const profile: Profile = {
          id: existingProfile.id,
          user_id: existingProfile.user_id,
          name: existingProfile.name || 'User',
          role: existingProfile.role as UserRole,
          hotel_name: hotelName || undefined,
          status: existingProfile.status as UserStatus,
          admin_id: existingProfile.admin_id || undefined,
          client_permissions: clientPermissions
        };
        // Update cache
        localStorage.setItem(`profile_${user.id}`, JSON.stringify(profile));
        
        // Seed default data for new admins (fire and forget)
        if (profile.role === 'admin' && profile.status === 'active') {
          seedAdminDefaults(profile.id).catch(() => {});
        }
        
        return profile;
      }

      // 3. If no profile exists in DB, try to create one
      // (Only if we are online/connected, otherwise we might just return basic profile)
      devLog('No profile found, attempting to create...');
      try {
        const profileData = {
          user_id: user.id,
          name: user.user_metadata?.name || user.email?.split('@')[0] || 'User',
          role: 'user', // Hardcoded to 'user' for safety
          hotel_name: user.user_metadata?.hotel_name || null,
          status: 'active' as UserStatus,
          admin_id: user.user_metadata?.admin_id || null
        };

        const createPromise = supabase
          .from('profiles')
          .insert([profileData])
          .select()
          .single();

        const createTimeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Profile creation timeout')), 3000)
        );

        const { data, error } = await Promise.race([
          createPromise,
          createTimeoutPromise
        ]) as any;

        if (!error && data) {
          devLog('Profile created successfully');
          const newProfile: Profile = {
            id: data.id,
            user_id: data.user_id,
            name: data.name,
            role: data.role as UserRole,
            hotel_name: data.hotel_name,
            status: data.status as UserStatus,
            admin_id: data.admin_id || undefined
          };
          localStorage.setItem(`profile_${user.id}`, JSON.stringify(newProfile));
          return newProfile;
        }
      } catch (createError) {
        devLog('Profile creation failed, using basic profile');
      }

      // 4. Fallback: If everything failed (no cache, no DB, no creation), use basic metadata
      devLog('Returning basic profile from metadata');
      const basicProfile = createBasicProfile(user);
      // Even cache this basic profile so next time we load faster
      localStorage.setItem(`profile_${user.id}`, JSON.stringify(basicProfile));
      return basicProfile;

    } catch (error) {
      devLog('Error in fetchOrCreateProfile');
      // Last resort
      return createBasicProfile(user);
    }
  };

  useEffect(() => {
    devLog('AuthProvider initializing...');

    let mounted = true;

    // Ensure loading never gets stuck for more than 3 seconds (faster failsafe)
    const failsafeTimeout = setTimeout(() => {
      if (mounted && loading) {
        devLog('Failsafe timeout - setting loading to false');
        setLoading(false);
      }
    }, 3000);

    const handleAuthStateChange = async (event: string, newSession: Session | null) => {
      devLog('Auth state changed:', event);

      if (!mounted) return;

      try {
        setSession(newSession);
        setUser(newSession?.user || null);

        if (newSession?.user) {
          devLog('User found, fetching/creating profile...');

          // Use setTimeout to avoid blocking the auth state change
          setTimeout(async () => {
            if (!mounted) return;

            try {
              const userProfile = await fetchOrCreateProfile(newSession.user);

              if (mounted) {
                setProfile(userProfile);
                devLog('Profile set');
              }
            } catch (profileError) {
              devLog('Profile handling error');
              if (mounted) {
                // Set a basic profile if all else fails
                setProfile(createBasicProfile(newSession.user));
              }
            } finally {
              if (mounted) {
                setLoading(false);
                clearTimeout(failsafeTimeout);
              }
            }
          }, 50); // Reduced from 100ms
        } else {
          if (mounted) {
            setProfile(null);
            setLoading(false);
            clearTimeout(failsafeTimeout);
          }
        }
      } catch (error) {
        devLog('Error in auth state change handler');
        if (mounted) {
          setProfile(null);
          setLoading(false);
          clearTimeout(failsafeTimeout);
        }
      }
    };

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(handleAuthStateChange);

    // Initialize auth state with faster timeout
    const initAuth = async () => {
      try {
        devLog('Getting initial session...');

        // Faster timeout for session fetch
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Session fetch timeout')), 2000)
        );

        const { data: { session: initialSession } } = await Promise.race([
          sessionPromise,
          timeoutPromise
        ]) as any;

        devLog('Initial session retrieved');

        if (mounted) {
          await handleAuthStateChange('INITIAL', initialSession);
        }
      } catch (error) {
        devLog('Auth initialization error');
        if (mounted) {
          setLoading(false);
          clearTimeout(failsafeTimeout);
        }
      }
    };

    // Faster initialization timeout
    const initializationTimeout = setTimeout(() => {
      if (mounted && loading) {
        devLog('Initialization timeout, proceeding without session');
        setLoading(false);
        clearTimeout(failsafeTimeout);
      }
    }, 2500);

    initAuth();

    return () => {
      mounted = false;
      subscription.unsubscribe();
      clearTimeout(initializationTimeout);
      clearTimeout(failsafeTimeout);
    };
  }, []);

  // Real-time subscription to detect pause and force logout
  useEffect(() => {
    if (!user || !profile) return;

    devLog('[AuthContext] Setting up realtime subscription for force logout...');

    // Subscribe to profile changes with a unique channel name
    const channel = supabase
      .channel(`force-logout-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles'
        },
        async (payload) => {
          const updatedProfile = payload.new as any;
          const oldProfile = payload.old as any;

          devLog('[AuthContext] Profile update received');

          // Check if this update affects the current user
          const isCurrentUser = updatedProfile.user_id === user.id;
          const isCurrentUserAdmin = profile.admin_id && updatedProfile.id === profile.admin_id;

          if (isCurrentUser || isCurrentUserAdmin) {
            devLog('[AuthContext] Relevant update detected');

            // If current user was paused/deleted, force logout
            if (isCurrentUser && (updatedProfile.status === 'paused' || updatedProfile.status === 'deleted')) {
              devLog('[AuthContext] Current user paused/deleted - forcing logout');

              // Clear cached profile
              localStorage.removeItem(`profile_${user.id}`);

              // Show toast notification
              const { toast } = await import('@/hooks/use-toast');
              toast({
                title: "Account Paused",
                description: "Your account has been paused by an administrator.",
                variant: "destructive"
              });

              // Force sign out
              await supabase.auth.signOut();
              setUser(null);
              setSession(null);
              setProfile(null);
              return;
            }

            // If parent admin was paused/deleted, force logout sub-user
            if (isCurrentUserAdmin && (updatedProfile.status === 'paused' || updatedProfile.status === 'deleted')) {
              devLog('[AuthContext] Parent admin paused/deleted - forcing sub-user logout');

              // Clear cached profile
              localStorage.removeItem(`profile_${user.id}`);

              // Show toast notification
              const { toast } = await import('@/hooks/use-toast');
              toast({
                title: "Account Paused",
                description: "Account paused by Super Admin",
                variant: "destructive"
              });

              // Force sign out
              await supabase.auth.signOut();
              setUser(null);
              setSession(null);
              setProfile(null);
              return;
            }

            // If user status changed to active (e.g., re-activated), update profile
            if (isCurrentUser && updatedProfile.status !== profile.status) {
              devLog('[AuthContext] User status changed, updating local profile');
              setProfile(prev => prev ? { ...prev, status: updatedProfile.status as UserStatus } : null);
            }
          }
        }
      )
      .subscribe((status) => {
        devLog('[AuthContext] Force logout subscription status:', status);
      });

    return () => {
      devLog('[AuthContext] Cleaning up force-logout realtime subscription');
      supabase.removeChannel(channel);
    };
  }, [user?.id, profile?.id, profile?.admin_id, profile?.status]);

  const signUp = async (
    email: string,
    password: string,
    name: string,
    role: string = 'user',
    hotelName?: string,
    adminId?: string,
    extras?: { mobileNumber?: string; shopName?: string; address?: string }
  ) => {
    devLog('Sign up attempt');

    const userData: any = { name, role };
    if (hotelName && role === 'admin') userData.hotel_name = hotelName;
    if (adminId) userData.admin_id = adminId;
    if (extras?.mobileNumber) userData.mobile_number = extras.mobileNumber;
    if (extras?.shopName && role === 'admin') userData.shop_name = extras.shopName;
    if (extras?.address && role === 'admin') userData.address = extras.address;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: userData
      }
    });

    // If signup was successful and we have a user, create the profile immediately
    // This ensures the user appears in the Users list right away
    if (!error && data?.user) {
      devLog('Auth user created, now creating profile record...');
      try {
        const profileData: any = {
          user_id: data.user.id,
          name: name,
          role: role as UserRole,
          hotel_name: role === 'admin' ? hotelName : null,
          // New admins start as 'paused' - need Super Admin approval
          // Sub-users created by admins start as 'active'
          status: (role === 'admin' && !adminId ? 'paused' : 'active') as UserStatus,
          admin_id: adminId || null,
          mobile_number: extras?.mobileNumber || null,
          shop_name: role === 'admin' ? (extras?.shopName || null) : null,
          address: role === 'admin' ? (extras?.address || null) : null,
        };

        const { error: profileError } = await supabase
          .from('profiles')
          .insert([profileData]);

        if (profileError) {
          // If profile already exists (unique constraint), that's okay
          if (!profileError.message?.includes('duplicate') && !profileError.message?.includes('unique')) {
            devLog('Failed to create profile');
          } else {
            devLog('Profile already exists for this user');
          }
        } else {
          devLog('Profile created successfully for new user');
        }
      } catch (profileCreateError) {
        devLog('Error creating profile');
        // Don't fail the signup because of profile creation failure
      }
    }

    devLog('Sign up result:', error ? 'Error' : 'Success');
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    devLog('Sign in attempt');

    // Clear any cached permissions before login to ensure fresh permissions
    // This helps when admin has changed permissions for this user
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('hotel_pos_permissions_')) {
        localStorage.removeItem(key);
      }
    });

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      console.log('Sign in error:', error.message);
      return { error };
    }

    // Check if user/admin is paused using the database function
    if (data?.user) {
      try {
        const { data: loginCheck, error: checkError } = await supabase
          .rpc('is_user_allowed_to_login', { p_user_id: data.user.id });

        if (checkError) {
          console.error('Error checking login status:', checkError);
          // Allow login if check fails to avoid blocking users
        } else if (loginCheck && loginCheck.length > 0) {
          const result = loginCheck[0];
          if (!result.allowed) {
            // User is not allowed to login - sign them out
            await supabase.auth.signOut();
            return { error: { message: result.reason || 'Account paused' } };
          }
        }
      } catch (e) {
        console.error('Error in login check:', e);
        // Allow login if check fails
      }

      // Update login stats (Fire and forget)
      try {
        // First get current count
        const { data: currentProfile } = await supabase
          .from('profiles')
          .select('login_count')
          .eq('user_id', data.user.id)
          .single();

        const currentCount = currentProfile?.login_count || 0;

        // Update stats
        await supabase
          .from('profiles')
          .update({
            last_login: new Date().toISOString(),
            login_count: currentCount + 1
          })
          .eq('user_id', data.user.id);
      } catch (statError) {
        console.error('Failed to update login stats:', statError);
        // Fail silently, don't block login
      }
    }

    devLog('Sign in result: Success');
    return { error: null };
  };

  const signOut = async () => {
    devLog('Signing out...');

    setLoading(true);

    // SECURITY: Clear all cached profile data from localStorage on signOut
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('profile_') || key.startsWith('hotel_pos_permissions_')) {
        localStorage.removeItem(key);
      }
    });

    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setLoading(false);
  };

  const contextValue = {
    user,
    session,
    profile,
    loading,
    signUp,
    signIn,
    signOut,
  };

  devLog('AuthProvider render - loading:', loading, 'user:', !!user, 'profile:', !!profile);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};
