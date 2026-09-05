import { describe, expect, it } from 'vitest';
import { assertTenantId, resolveAdminProfileId, resolveAuthUserId } from '@/utils/identity';
import { isOnlineRequiredError, OnlineRequiredError } from '@/utils/onlineGuard';

const profile = (overrides: Record<string, unknown>) => ({
  id: 'profile-own',
  user_id: 'auth-own',
  role: 'admin',
  admin_id: null,
  ...overrides,
} as any);

describe('canonical identity contract', () => {
  it('uses profiles.id for an admin tenant', () => {
    expect(resolveAdminProfileId(profile({}))).toBe('profile-own');
  });

  it('uses the parent profiles.id for a child user tenant', () => {
    expect(resolveAdminProfileId(profile({ role: 'user', admin_id: 'profile-parent' }))).toBe('profile-parent');
  });

  it('never substitutes auth uid for tenant id', () => {
    expect(resolveAdminProfileId(profile({ id: 'profile-a', user_id: 'auth-a' }))).toBe('profile-a');
    expect(resolveAuthUserId('auth-session', profile({}))).toBe('auth-session');
  });
});

describe('online action guard', () => {
  it('exposes a stable error code without mutating offline data', () => {
    const error = new OnlineRequiredError('Cloud backup');
    expect(isOnlineRequiredError(error)).toBe(true);
    expect(error.message).toContain('requires an internet connection');
  });
});
describe('assertTenantId guardrail', () => {
  const authUid = '11111111-1111-1111-1111-111111111111';
  const profileId = '22222222-2222-2222-2222-222222222222';

  it('passes through a valid profile tenant id', () => {
    expect(assertTenantId(profileId, authUid, 'items.insert')).toBe(profileId);
  });

  it('rejects an auth user id used as admin_id', () => {
    expect(() => assertTenantId(authUid, authUid, 'items.insert')).toThrow(/admin_id/);
  });

  it('ignores empty values', () => {
    expect(assertTenantId(null, authUid, 'items.insert')).toBeNull();
  });
});
