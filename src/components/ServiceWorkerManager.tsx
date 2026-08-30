import { useEffect } from 'react';

const ServiceWorkerManager = () => {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // Only register the app-shell SW when it actually exists — a 404 here used to
    // spam registration failures and made push-notification debugging confusing.
    fetch('/sw.js', { method: 'HEAD' })
      .then((res) => (res.ok ? navigator.serviceWorker.register('/sw.js', { scope: '/' }) : null))
      .then((registration) => {
        if (!registration) return;
        console.log('SW registered:', registration.scope);

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              if (confirm('New version available! Refresh to update?')) {
                window.location.reload();
              }
            }
          });
        });
      })
      .catch((error) => {
        console.log('SW registration skipped:', error);
      });
  }, []);

  return null;
};

export default ServiceWorkerManager;
