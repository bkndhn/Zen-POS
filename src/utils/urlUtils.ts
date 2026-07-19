import { Capacitor } from '@capacitor/core';

export const getAppBaseUrl = () => {
    if (Capacitor.isNativePlatform()) {
        return 'https://zenpos.vercel.app';
    }
    return typeof window !== 'undefined' ? window.location.origin : '';
};
