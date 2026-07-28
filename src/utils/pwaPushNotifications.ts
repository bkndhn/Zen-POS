/**
 * World-Grade Android & PWA Status Bar Push Notification System
 * Auto-triggers system status bar push notifications with vibration, sound, badge, and deep links.
 */

export interface PushNotificationPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
  vibrate?: number[];
  requireInteraction?: boolean;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission !== 'denied') {
    try {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    } catch {
      return false;
    }
  }
  return false;
}

export async function sendPwaStatusBarNotification(payload: PushNotificationPayload) {
  try {
    const hasPermission = await requestNotificationPermission();
    const icon = payload.icon || '/brand/logo.png';
    const tag = payload.tag || 'zenpos-notification';
    const vibrate = payload.vibrate || [200, 100, 200, 100, 200];

    if ('serviceWorker' in navigator && hasPermission) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(payload.title, {
        body: payload.body,
        icon,
        badge: icon,
        vibrate,
        tag,
        renotify: true,
        requireInteraction: payload.requireInteraction ?? false,
        data: { url: payload.url || '/' },
      } as NotificationOptions);
    } else if ('Notification' in window && hasPermission) {
      new Notification(payload.title, {
        body: payload.body,
        icon,
        tag,
      });
    }
  } catch (err) {
    console.warn('PWA Push Notification trigger fallback:', err);
  }
}

/**
 * Low Stock Auto Status Bar Push Trigger
 */
export function triggerLowStockPushNotification(itemName: string, remainingQuantity: number, minStock: number, unit?: string) {
  const unitStr = unit ? ` ${unit}` : '';
  sendPwaStatusBarNotification({
    title: `📦 Low Stock Alert: ${itemName}`,
    body: `Only ${remainingQuantity}${unitStr} left in stock (Min limit: ${minStock}${unitStr}). Tap to view inventory!`,
    url: '/stock',
    tag: `low-stock-${itemName.toLowerCase().replace(/\s+/g, '-')}`,
    vibrate: [300, 100, 300],
    requireInteraction: true,
  });
}

/**
 * New Order Status Bar Push Trigger
 */
export function triggerNewOrderPushNotification(orderNumber: string | number, tableOrType: string, amount: number) {
  sendPwaStatusBarNotification({
    title: `🔔 New Order #${orderNumber} Received!`,
    body: `${tableOrType} • Total: ₹${amount}. Tap to view in Kitchen Display.`,
    url: '/kitchen-display',
    tag: `new-order-${orderNumber}`,
    vibrate: [150, 50, 150, 50, 200],
  });
}
