# Smart Library Presets Update

Design Vault now treats each library as a reusable content preset instead of hard-coding special behavior for one library name.

## Presets

- **Design · 16:9 · 1920×1080** — image-first; best for Sermon Series and landscape key art.
- **Story video · 9:16 · 1080×1920** — video-first; each option can store its own YouTube/direct-video URL.

Existing libraries named **Plan Your Visit** are automatically interpreted as Story video locally, and the included Supabase migration upgrades their cloud settings to 1080×1920 / 9:16.

## Per-option video

`videoUrl` now belongs to each option. The old Idea Box-level `videoUrl` remains as a legacy fallback so existing boxes do not lose playback.

When a Story video option is selected:

- its own video URL drives the main player,
- its poster image remains the visual thumbnail,
- the right panel shows that option's video URL,
- each version can point to a different YouTube/direct video.

## Required Supabase update

Run `supabase/smart-library-migration.sql` once in Supabase SQL Editor. It is safe to run more than once and also repairs/creates the multi-library columns/policies needed by the previous update.
