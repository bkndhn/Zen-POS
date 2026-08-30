
import { useEffect } from 'react';

const ServiceWorkerManager = () => {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // Only register the app shell SW when it actually exists — a 404 here used to
    // spam registration failures and confuse push-notification debugging.
    fetch('/sw.js', { method: 'HEAD' })
      .then((res) => {
        if (!res.ok) return null;
        return navigator.serviceWorker.register('/sw.js', { scope: '/' });
      })
      .then(registration => {
        if (!registration) return;

        .then(registration => {
          console.log('SW registered: ', registration);
          
          // Check for updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // New content is available, refresh the page
                  if (confirm('New version available! Refresh to update?')) {
                    window.location.reload();
                  }
                }
              });
            }
          });
        })
        .catch(error => {
          console.log('SW registration failed: ', error);
        });
    }
  }, []);

  return null;
};

export default ServiceWorkerManager;
