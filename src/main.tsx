import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Register PWA Service Worker for offline and installation support (only in production)
if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => {
          console.log('WMS PWA Service Worker registered successfully:', reg.scope);
        })
        .catch((err) => {
          console.error('WMS PWA Service Worker registration failed:', err);
        });
    });
  } else {
    // In development mode, unregister any active service workers to prevent dynamic import/caching issues
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister().then((success) => {
          if (success) {
            console.log('Successfully unregistered stale development Service Worker');
            // Force reload to clean up caches and service worker state
            window.location.reload();
          }
        });
      }
    });
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
