import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import './i18n'
import { startRum } from './utils/rum'
import { initStoragePersistence } from './utils/nativeStorage'

startRum();
initStoragePersistence().catch(() => {});

createRoot(document.getElementById("root")!).render(<App />);

