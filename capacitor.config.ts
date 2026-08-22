import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.zenpos.app',
  appName: 'ZenPOS',
  webDir: 'dist',
  server: {
    url: 'https://zen-pos.vercel.app',
    cleartext: false
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
    },
    CapacitorHttp: {
      enabled: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"]
    }
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  ios: {
    contentInset: 'always',
    preferredContentMode: 'mobile',
    scrollEnabled: true,
  }
};

export default config;
