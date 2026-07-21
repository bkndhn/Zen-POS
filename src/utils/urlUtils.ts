import { Capacitor } from '@capacitor/core';

export const getAppBaseUrl = () => {
    if (Capacitor.isNativePlatform()) {
        // In the Android/iOS app, window.location.origin is localhost.
        // We must use the production URL for sharing links (QR codes, WhatsApp, etc.)
        return import.meta.env.VITE_APP_URL || 'https://zen-pos.vercel.app';
    }
    return typeof window !== 'undefined' ? window.location.origin : '';
};
