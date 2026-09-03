import type { Profile } from '@/types/auth';

/** Database `admin_id`: always the owning admin's public profiles.id. */
export function resolveAdminProfileId(profile: Profile | null | undefined): string | null {
  if (!profile) return null;
  return profile.role === 'user' ? profile.admin_id ?? null : profile.id;
}

/** Database `created_by` / `user_id`: the signed-in auth.users.id. */
export function resolveAuthUserId(
  authUserId: string | null | undefined,
  profile: Profile | null | undefined,
): string | null {
  return authUserId ?? profile?.user_id ?? null;
}