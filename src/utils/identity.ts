import type { Profile } from '@/types/user';

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
/**
 * Development guardrail: tenant columns (`admin_id`) must always hold a
 * profiles.id, never an auth.users.id. Passing the signed-in auth UID here is
 * the single most common regression when new screens are added, so fail loudly
 * in dev and log in production instead of silently writing cross-tenant rows.
 */
export function assertTenantId(
  value: string | null | undefined,
  authUserId: string | null | undefined,
  context: string,
): string | null | undefined {
  if (value && authUserId && value === authUserId) {
    const message = `[identity] ${context}: admin_id was set to the auth user id. Use adminProfileId (profiles.id) instead.`;
    if (import.meta.env?.DEV) throw new Error(message);
    console.error(message);
  }
  return value;
}
