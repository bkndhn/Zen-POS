import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { App as CapacitorApp } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';

export const NativeAppController = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    // Handle Hardware Back Button natively
    const backButtonListener = CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      // If we are on the root or dashboard, exit the app
      if (window.location.pathname === '/' || window.location.pathname === '/dashboard' || window.location.pathname === '/auth') {
        CapacitorApp.exitApp();
      } else if (canGoBack) {
        navigate(-1);
      } else {
        CapacitorApp.exitApp();
      }
    });

    // Hide Splash Screen
    SplashScreen.hide().catch(() => {});

    // Manage Status Bar styling
    const updateStatusBar = async () => {
      try {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const savedDarkMode = localStorage.getItem('hotel_pos_dark_mode');
        const isDarkMode = savedDarkMode === 'true' || (savedDarkMode === null && prefersDark);
        
        await StatusBar.setStyle({ style: isDarkMode ? Style.Dark : Style.Light });
        const color = isDarkMode ? '#09090b' : '#ffffff';
        await StatusBar.setBackgroundColor({ color });
      } catch (e) {
        // Status bar plugin might not be available or supported
      }
    };

    updateStatusBar();
    window.addEventListener('theme-changed', updateStatusBar);

    return () => {
      window.removeEventListener('theme-changed', updateStatusBar);
      backButtonListener.then(listener => listener.remove());
    };
  }, [navigate]);

  return null;
};
