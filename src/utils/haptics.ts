// Centralized haptic feedback utility — uses native Capacitor Haptics for premium
// tactile feedback on native apps, falls back to Web Vibration API on PWA/web.
//
// Usage:
//   import { hapticTap, hapticSuccess, hapticWarning } from '@/utils/haptics';
//   hapticTap();      // Light tap — nav, buttons, toggles
//   hapticSuccess();  // Medium bump — bill saved, payment done
//   hapticWarning();  // Heavy thud — delete, error, alert

let _haptics: typeof import('@capacitor/haptics') | null = null;
const isNative = () => !!(window as any).Capacitor?.isNativePlatform();

const getHaptics = async () => {
  if (!_haptics && isNative()) {
    _haptics = await import('@capacitor/haptics');
  }
  return _haptics;
};

/** Light tap — for navigation, toggles, list item taps */
export const hapticTap = async () => {
  try {
    const h = await getHaptics();
    if (h) {
      await h.Haptics.impact({ style: h.ImpactStyle.Light });
    } else {
      (navigator as any).vibrate?.(8);
    }
  } catch { /* noop */ }
};

/** Medium bump — for bill saved, payment completed, item added */
export const hapticSuccess = async () => {
  try {
    const h = await getHaptics();
    if (h) {
      await h.Haptics.notification({ type: h.NotificationType.Success });
    } else {
      (navigator as any).vibrate?.(15);
    }
  } catch { /* noop */ }
};

/** Heavy thud — for delete, error, alert */
export const hapticWarning = async () => {
  try {
    const h = await getHaptics();
    if (h) {
      await h.Haptics.notification({ type: h.NotificationType.Warning });
    } else {
      (navigator as any).vibrate?.(25);
    }
  } catch { /* noop */ }
};
