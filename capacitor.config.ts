import type { CapacitorConfig } from '@capacitor/cli';

// Read from process.env if available (Node build time), otherwise fallback
const isOfflineBuild = process.env.CAPACITOR_BUILD_MODE === 'offline';

const config: CapacitorConfig = {
  appId: 'com.zenpos.app',
  appName: 'ZenPOS',
  webDir: 'dist',
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
    },
    CapacitorSQLite: {
      iosDatabaseLocation: 'Library/CapacitorDatabase',
      iosIsEncryption: true,
      iosKeychainPrefix: 'com.zenpos.app',
      androidIsEncryption: true,
      iosBiometric: { biometricAuth: false },
      androidBiometric: { biometricAuth: false }
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

// Only inject the server URL if we are NOT building the true offline APK
if (!isOfflineBuild) {
  config.server = {
    url: 'https://zen-pos.vercel.app',
    cleartext: false
  };
}

export default config;
