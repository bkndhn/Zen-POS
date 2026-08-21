import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export const usePushNotifications = () => {
  const { user } = useAuth();

  useEffect(() => {
    // Only run on native Android/iOS — skip entirely on web browsers
    if (!user || !Capacitor.isNativePlatform()) return;
    // Skip when the native plugin was not compiled into this build (e.g. APK
    // built without the FCM plugin) — otherwise every call rejects with
    // `"PushNotifications" plugin is not implemented on android`.
    if (!Capacitor.isPluginAvailable('PushNotifications')) {
      console.warn('PushNotifications plugin not available on this build — skipping.');
      return;
    }

    let cleanup = false;

    const init = async () => {
      try {
        // Dynamic import so the module is never loaded on web
        const { PushNotifications } = await import('@capacitor/push-notifications');


        const permStatus = await PushNotifications.checkPermissions();

        if (permStatus.receive === 'prompt') {
          const newStatus = await PushNotifications.requestPermissions();
          if (newStatus.receive !== 'granted') {
            console.warn('Push notification permission denied');
            return;
          }
        } else if (permStatus.receive !== 'granted') {
          console.warn('Push notification permission denied');
          return;
        }

        if (Capacitor.getPlatform() === 'android') {
          await PushNotifications.createChannel({
            id: 'zenpos_default',
            name: 'ZenPOS Notifications',
            description: 'Order alerts, low stock warnings, and important updates',
            importance: 5, // Max importance
            visibility: 1,
            vibration: true,
            sound: 'default',
            lights: true,
          });
        }

        // On successful registration, save the token to Supabase
        await PushNotifications.addListener('registration', async (token) => {
          console.log('Push registration success, token: ' + token.value);
          if (cleanup) return;
          if (user?.id) {
            try {
              const upsertResult = await supabase.from('user_devices').upsert({
                user_id: user.id,
                device_token: token.value,
                platform: Capacitor.getPlatform()
              }, { onConflict: 'user_id,device_token' });
              
              if (upsertResult.error) {
                console.error('Failed to save FCM token:', upsertResult.error);
              }
            } catch (e) {
              console.error('Exception while saving FCM token:', e);
            }
          }
        });

        await PushNotifications.addListener('registrationError', (error: any) => {
          console.error('Error on registration: ' + JSON.stringify(error));
          setTimeout(() => {
            if (!cleanup) {
              console.log('Retrying push registration...');
              PushNotifications.register().catch(e => console.error('Retry failed:', e));
            }
          }, 3000);
        });

        // Show a toast when a push notification arrives while app is open
        await PushNotifications.addListener('pushNotificationReceived', (notification) => {
          console.log('Push received: ' + JSON.stringify(notification));
          toast.info(notification.title || 'New Notification', {
            description: notification.body || ''
          });
        });

        // Handle tapping on a notification
        await PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
          console.log('Push action performed: ' + JSON.stringify(notification));
          const url = notification.notification.data?.url;
          if (url) {
            window.location.href = url;
          }
        });

        // Register with Firebase to receive the FCM token
        await PushNotifications.register();

      } catch (e) {
        // Silently fail on web or if plugin is not available
        console.warn('Push notifications not available on this platform:', e);
      }
    };

    init().catch((e) => console.warn('Push init failed:', e));

    return () => {
      cleanup = true;
      // Clean up listeners when component unmounts (only on native).
      // Every promise here must be caught — an uncaught "plugin is not
      // implemented" rejection surfaces as an unhandled rejection in Sentry.
      if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('PushNotifications')) {
        import('@capacitor/push-notifications')
          .then(({ PushNotifications }) =>
            Promise.resolve(PushNotifications.removeAllListeners()).catch(() => {})
          )
          .catch(() => {});
      }
    };

  }, [user]);
};

