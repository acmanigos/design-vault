# Local-first architecture update

## Changed

- IndexedDB is now the primary database for normal app reads and writes.
- Supabase no longer blocks normal UI saves.
- Added an IndexedDB sync queue for cloud upserts/deletes.
- Added `updatedAt`, `lastSyncedAt`, and per-Idea-Box `syncStatus`.
- Added latest-edit-wins conflict handling.
- Added background auto sync and manual **Sync now**.
- Added offline-aware behavior and automatic retry when the browser comes back online.
- Added a visible local/cloud sync status bar.
- Added per-card sync state.
- Preserved local data URLs for locally-created images after cloud upload, avoiding unnecessary re-downloads on the same device.
- Supabase image URLs are tracked separately as `cloudImageUrl`, avoiding repeat uploads when only metadata changes.

## Removed

- The old Supabase-only source-of-truth behavior.
- The separate `legacy-indexeddb.ts` compatibility layer; its legacy normalization/migration behavior is now incorporated into `local-db.ts`.
- The old one-time “Import local vault” workflow. Local data now simply participates in the sync system.

## Preserved

- Sermon-series-only focus
- Idea Boxes and options
- prompts and notes
- palettes
- thumbnail selection
- option drag sorting
- folder/bulk drop
- clipboard paste
- YouTube/direct-video support
- favorites and vault sorting
- GitHub Pages configuration
- existing Supabase schema and Storage bucket
