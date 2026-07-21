import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.zenpos.app',
  appName: 'ZenPOS',
  webDir: 'dist',
  server: {
    url: 'https://zen-pos.vercel.app',
    cleartext: true
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 5000,
      launchAutoHide: false,
      backgroundColor: "#ffffff",
      showSpinner: true,
      androidSpinnerStyle: "large",
      spinnerColor: "#3b82f6",
      splashFullScreen: true,
      splashImmersive: true,
    },
    Keyboard: {
      resize: "native",
      resizeOnFullScreen: true,
    }
  }
};

export default config;
