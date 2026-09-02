import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Capacitor } from '@capacitor/core';
import { Download } from 'lucide-react';

// Hardcoded version for this build. In a real pipeline, inject this via VITE_APP_VERSION
const CURRENT_APK_VERSION = '1.0.0';

export function AppUpdater() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState('');

  useEffect(() => {
    // Only run this inside the True Offline APK (where server.url is disabled)
    if (!Capacitor.isNativePlatform()) return;
    
    // In a live-update APK, window.location.origin is usually https://zen-pos.vercel.app
    // In a true offline APK, it's usually capacitor://localhost or http://localhost
    if (window.location.origin.includes('vercel.app')) return;

    const checkVersion = async () => {
      try {
        if (!navigator.onLine) return;
        
        // In the future, host a version.json on your Vercel public folder or Supabase storage
        // For now, this is a placeholder logic that you can wire up to your actual release system
        const res = await fetch('https://zen-pos.vercel.app/version.json', { cache: 'no-store' }).catch(() => null);
        if (!res || !res.ok) return;
        
        const data = await res.json();
        if (data && data.version && data.version !== CURRENT_APK_VERSION) {
          setDownloadUrl(data.downloadUrl || 'https://zen-pos.vercel.app');
          setUpdateAvailable(true);
        }
      } catch (e) {
        console.warn('Update check failed', e);
      }
    };

    // Check on startup and then every 12 hours
    checkVersion();
    const interval = setInterval(checkVersion, 12 * 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (!updateAvailable) return null;

  return (
    <Dialog open={updateAvailable} onOpenChange={setUpdateAvailable}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Update Available</DialogTitle>
          <DialogDescription>
            A new version of ZenPOS is available. Since you are using the True Offline version, you need to download the latest APK to get new features and bug fixes.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-start">
          <Button type="button" onClick={() => window.open(downloadUrl, '_system')}>
            <Download className="w-4 h-4 mr-2" />
            Download Update
          </Button>
          <Button type="button" variant="secondary" onClick={() => setUpdateAvailable(false)}>
            Later
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
