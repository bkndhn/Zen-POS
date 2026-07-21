import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import './i18n'
import { startRum } from './utils/rum'

startRum();

createRoot(document.getElementById("root")!).render(<App />);
