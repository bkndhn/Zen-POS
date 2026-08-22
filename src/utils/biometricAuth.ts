// Biometric authentication utility for native apps.
// Uses capacitor-native-biometric for fingerprint/face unlock.
// Falls back gracefully on web/PWA (biometric not available).

import { Capacitor } from '@capacitor/core';

interface BiometricResult {
  available: boolean;
  authenticated: boolean;
  error?: string;
}

/** Check if biometrics are available on this device */
export const isBiometricAvailable = async (): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const { NativeBiometric } = await import('capacitor-native-biometric');
    const result = await NativeBiometric.isAvailable();
    return result.isAvailable;
  } catch {
    return false;
  }
};

/** Prompt the user for biometric authentication (fingerprint/face) */
export const authenticateWithBiometric = async (): Promise<BiometricResult> => {
  if (!Capacitor.isNativePlatform()) {
    return { available: false, authenticated: false, error: 'Not on native platform' };
  }

  try {
    const { NativeBiometric } = await import('capacitor-native-biometric');
    const availability = await NativeBiometric.isAvailable();

    if (!availability.isAvailable) {
      return { available: false, authenticated: false, error: 'Biometric not available' };
    }

    await NativeBiometric.verifyIdentity({
      reason: 'Unlock ZenPOS',
      title: 'Authenticate',
      subtitle: 'Use fingerprint or face to unlock',
      description: 'Place your finger on the sensor to continue',
      useFallback: true, // Allow PIN/pattern fallback
      maxAttempts: 3,
    });

    return { available: true, authenticated: true };
  } catch (e: any) {
    return {
      available: true,
      authenticated: false,
      error: e?.message || 'Authentication failed',
    };
  }
};
