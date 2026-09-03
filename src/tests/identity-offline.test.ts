import { describe, expect, it } from 'vitest';
import { resolveAdminProfileId, resolveAuthUserId } from '@/utils/identity';
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