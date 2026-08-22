import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import './i18n'
import * as Sentry from '@sentry/react'
import { startRum } from './utils/rum'
import { initStoragePersistence } from './utils/nativeStorage'
import { installPerfProfiler } from './utils/perfProfiler'
import { syncEngine } from './utils/syncEngine'
import { offlineManager } from './utils/offlineManager'
import { initStorage } from './utils/storage'

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN || "",
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  // Noise from third-party/injected scripts and unsupported native plugins —
  // not actionable application errors.
  ignoreErrors: [
    /has no method 'updateFrom'/i,
    /plugin is not implemented on (android|ios)/i,
    /ResizeObserver loop/i,
    /WebAssembly\.instantiate/i,
    /Aborted\(LinkError/i,
    /function import requires a callable/i,
  ],
  denyUrls: [/\/sentry\/scripts\//i, /extensions\//i, /^chrome-extension:\/\//i],
  tracesSampleRate: 1.0, 
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});


installPerfProfiler();
startRum();
initStoragePersistence().catch(() => {});

// Initialize SQLite backend (native or WASM) and wire into offlineManager
// This runs in the background — offlineManager falls back to IndexedDB until ready
initStorage()
  .then((backend) => {
    offlineManager.setBackend(backend);
    console.log('[Boot] Storage backend wired into offlineManager');
  })
  .catch((err) => {
    console.warn('[Boot] SQLite init failed — offlineManager continues with IndexedDB:', err);
  });

syncEngine.start();

createRoot(document.getElementById("root")!).render(<App />);

