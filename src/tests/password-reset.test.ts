import { describe, it, expect } from 'vitest';
import { validateNewPassword, getPasswordResetRedirect } from '@/utils/passwordReset';

describe('password reset rules', () => {
  it('requires both entries to match', () => {
    expect(validateNewPassword('abc12345', 'abc12346')).toBe('Both passwords must match.');
    expect(validateNewPassword('abc12345', 'abc12345')).toBeNull();
  });
  it('requires 8+ chars with letters and numbers', () => {
    expect(validateNewPassword('ab12', 'ab12')).not.toBeNull();
    expect(validateNewPassword('abcdefgh', 'abcdefgh')).not.toBeNull();
  });
  it('never sends reset links to the private preview', () => {
    expect(getPasswordResetRedirect('https://id-preview--x.lovable.app')).toBe('https://zen-pos.vercel.app/reset-password');
    expect(getPasswordResetRedirect('https://zen-pos.vercel.app')).toBe('https://zen-pos.vercel.app/reset-password');
  });
});
