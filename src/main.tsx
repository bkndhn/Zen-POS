import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import './i18n'
import { startRum } from './utils/rum'
import { initStoragePersistence } from './utils/nativeStorage'
import { installPerfProfiler } from './utils/perfProfiler'
import { syncEngine } from './utils/syncEngine'

installPerfProfiler();
startRum();
initStoragePersistence().catch(() => {});
syncEngine.start();

createRoot(document.getElementById("root")!).render(<App />);

