# Design Vault — Offline-First PWA + Supabase Sync

Design Vault is a focused sermon-series idea library. This build is now a true **offline-first Progressive Web App (PWA)**.

- **IndexedDB** is the primary working database.
- A **service worker** caches the app shell so the interface can reopen without internet after it has been loaded online once.
- **Supabase** runs as background cloud sync/backup when a connection is available.

## How it works

```text
Design Vault UI
      ↓
IndexedDB + cached app shell
      ↓
Supabase background sync
```

Normal browsing and editing never need to wait for Supabase.

## Offline behavior

After opening Design Vault online at least once and allowing the service worker to install, you can disconnect the internet and still:

- reopen the app;
- browse locally cached Idea Boxes;
- view locally cached option images;
- create sermon-series Idea Boxes;
- add, paste, and drag/drop images;
- drop folders to create Idea Boxes;
- edit prompts and notes;
- reorder options;
- edit palettes;
- choose thumbnails;
- favorite and delete items.

Offline mutations are saved immediately to IndexedDB and placed in the sync queue. When the connection returns, Auto Sync uploads them to Supabase.

The only content that cannot work offline is remote content that was never cached locally, such as a YouTube video that has not been downloaded (Design Vault does not download YouTube videos).

## First-time offline setup

1. Start Design Vault while online.
2. Open `http://localhost:3000` (or the deployed GitHub Pages URL).
3. Leave the page open for a few seconds so the service worker can cache the app shell.
4. Refresh once while still online if you want to confirm the service worker is controlling the page.
5. You can then disconnect the internet and reload/open the app again.

Chrome/Edge service workers work on `localhost` and on HTTPS deployments such as GitHub Pages.

## Cloud-image caching

Images created on the current computer remain stored as compressed local image data in IndexedDB.

When an Idea Box is downloaded from Supabase on another computer, Design Vault now also attempts to download each Supabase Storage image into IndexedDB. Once cached, that image remains visible offline on that device.

## Sync status

The top status bar shows states such as:

- **Cloud synced**
- **N changes waiting**
- **Syncing…**
- **Offline**
- **Sync error**

You can toggle **Auto sync** or press **Sync now** manually.

Conflict handling remains intentionally simple: **the most recently edited Idea Box wins**, based on `updatedAt`.

## PWA files

The offline app shell is implemented with:

```text
public/sw.js
public/manifest.webmanifest
public/icon.svg
components/pwa-register.tsx
```

No extra PWA npm package is required.

## Features preserved

- Sermon Series Idea Boxes
- multiple visual options per Idea Box
- prompt used + notes per option
- visible/editable color palettes
- option thumbnail selection
- option drag sorting
- bulk image drag/drop
- folder drop: folder name becomes Idea Box title
- clipboard image paste
- YouTube/Shorts/youtu.be playback while online
- direct MP4/WEBM playback
- favorites
- main-vault sorting
- edit/delete
- local IndexedDB storage
- Supabase background cloud sync
- GitHub Pages static export

## Local setup

### 1. Install dependencies

```bash
npm install
```

### 2. Supabase

If you already ran `supabase/schema.sql` for the previous Supabase version, no new database migration is required.

For a new Supabase project, run:

```text
supabase/schema.sql
```

in Supabase SQL Editor.

Create `.env.local` beside `package.json`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
```

Never put a Supabase `service_role` key in the frontend.

### 3. Run

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Testing offline locally

With the app loaded online first:

1. Open Chrome or Edge DevTools.
2. Go to **Application → Service Workers** and confirm `sw.js` is active.
3. Turn off Wi-Fi, or use the browser's Offline network mode.
4. Reload Design Vault.

Your locally cached vault and app shell should still load.

If you previously used a version without the PWA service worker, do one online reload after installing this update so the new worker can register.

## GitHub Pages

GitHub Pages support for the repository name `design-vault` is preserved.

The deployment workflow is:

```text
.github/workflows/deploy-pages.yml
```

Configure these GitHub Actions secrets:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

GitHub Pages uses HTTPS, so the PWA service worker can run there normally.

## Security before public sharing

The current Supabase policies are intended for the personal no-login MVP. Before widely sharing the public GitHub Pages URL, add Supabase Auth and ownership policies so anonymous visitors cannot modify your vault.

## Multiple libraries

This version supports user-created libraries in the left sidebar. Existing Idea Boxes automatically default to **Sermon Series**.

You can:

- create a library such as **Plan Your Visit**
- switch between libraries from the sidebar
- move an Idea Box to another library from **Edit Idea Box**
- delete custom libraries; their Idea Boxes are safely moved back to **Sermon Series**
- keep Favorites as a cross-library view

### Existing Supabase projects

If your Supabase project was created with an earlier Design Vault version, run `supabase/library-migration.sql` once in the Supabase SQL Editor before using cloud sync with this build. New projects can run the full `supabase/schema.sql` instead.

## Smart library presets (v0.8)

Libraries now have their own content preset. Use **Design · 16:9** for landscape graphics and **Story video · 9:16** for vertical video workflows such as Plan Your Visit. Story-video options each have their own video URL.

After updating an existing Supabase project, run `supabase/smart-library-migration.sql` once. This migration is idempotent and also repairs the earlier multi-library schema if needed.
