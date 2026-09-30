# Offline PWA update

This version adds true offline startup support.

## Added

- service worker app-shell cache;
- PWA manifest and icon;
- service-worker registration for localhost and `/design-vault/` GitHub Pages deployments;
- network-first navigation with cached fallback;
- runtime caching of Next.js JS/CSS assets;
- Supabase Storage image hydration into IndexedDB for offline viewing;
- IndexedDB-first startup remains unchanged;
- offline mutations continue to queue for later Supabase sync.

## Important

A browser must successfully open this version online at least once before it can reopen it offline. That first online visit installs the service worker and caches the frontend assets.
