'use client';

import { useEffect } from 'react';

function getBasePath() {
  if (typeof window === 'undefined') return '';
  return window.location.pathname === '/design-vault' || window.location.pathname.startsWith('/design-vault/')
    ? '/design-vault'
    : '';
}

export default function PwaRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const basePath = getBasePath();
    const swUrl = `${basePath}/sw.js`;
    const scope = `${basePath || ''}/`;

    let disposed = false;
    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register(swUrl, { scope });
        if (disposed) return;
        void registration.update();
      } catch (error) {
        console.warn('Design Vault offline service worker could not be registered.', error);
      }
    };

    if (document.readyState === 'complete') void register();
    else window.addEventListener('load', register, { once: true });

    return () => {
      disposed = true;
      window.removeEventListener('load', register);
    };
  }, []);

  return null;
}
