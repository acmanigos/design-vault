-- Design Vault library presets + per-option video support.
-- Run once in Supabase Dashboard -> SQL Editor.

alter table public.libraries add column if not exists preset text not null default 'image-landscape';
alter table public.libraries add column if not exists aspect_ratio text not null default '16:9';
alter table public.libraries add column if not exists width integer not null default 1920;
alter table public.libraries add column if not exists height integer not null default 1080;
alter table public.libraries add column if not exists option_video_enabled boolean not null default false;

alter table public.idea_options add column if not exists video_url text not null default '';

-- Smart default for an existing Plan Your Visit library.
update public.libraries
set preset = 'video-story', aspect_ratio = '9:16', width = 1080, height = 1920, option_video_enabled = true, updated_at = now()
where lower(name) like '%plan%your%visit%';

-- Keep Sermon Series landscape/image-first.
update public.libraries
set preset = 'image-landscape', aspect_ratio = '16:9', width = 1920, height = 1080, option_video_enabled = false, updated_at = now()
where id = 'sermon-series';
