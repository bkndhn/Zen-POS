import { useAuth } from '@/contexts/AuthContext';

/**
 * useTenant ensures that we consistently use the exact Profile UUID
 * for all tenant-scoped database operations, avoiding the dreaded
 * Auth UUID vs Profile UUID confusion.
 */
export const useTenant = () => {
  const { profile } = useAuth();
  
  // Golden Rule: The Tenant ID is always the Admin's Profile ID
  // If I am the admin, it's my profile.id. If I am a sub-user, it's my parent's profile.id.
  const adminProfileId = profile ? (profile.role === 'admin' ? profile.id : (profile.admin_id || profile.id)) : null;

  return { adminProfileId };
};
