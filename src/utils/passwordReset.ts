/** Returns an error message, or null when the new password is acceptable. */
export const validateNewPassword = (password: string, confirm: string): string | null => {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Use both letters and numbers.';
  if (password !== confirm) return 'Both passwords must match.';
  return null;
};

const PRODUCTION_URL = 'https://zen-pos.vercel.app';

/** Reset links must open on a public domain, never a private preview. */
export const getPasswordResetRedirect = (origin: string, configured?: string): string => {
  const isPrivatePreview = /id-preview--|lovableproject\.com|localhost|127\.0\.0\.1/.test(origin);
  const base = isPrivatePreview || !origin ? (configured || PRODUCTION_URL) : origin;
  return `${base.replace(/\/$/, '')}/reset-password`;
};
