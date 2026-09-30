-- Design Vault: repair/upgrade multi-library support + library presets + per-option video.
-- Safe to run more than once. Run this in Supabase Dashboard -> SQL Editor.

create table if not exists public.libraries (
  id text primary key,
  name text not null,
  preset text not null default 'image-landscape',
  aspect_ratio text not null default '16:9',
  width integer not null default 1920,
  height integer not null default 1080,
  option_video_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.libraries add column if not exists preset text not null default 'image-landscape';
alter table public.libraries add column if not exists aspect_ratio text not null default '16:9';
alter table public.libraries add column if not exists width integer not null default 1920;
alter table public.libraries add column if not exists height integer not null default 1080;
alter table public.libraries add column if not exists option_video_enabled boolean not null default false;

insert into public.libraries (id, name)
values ('sermon-series', 'Sermon Series')
on conflict (id) do nothing;

alter table public.idea_boxes add column if not exists library_id text not null default 'sermon-series';
alter table public.idea_options add column if not exists video_url text not null default '';

create index if not exists idea_boxes_library_idx on public.idea_boxes(library_id);
create index if not exists libraries_updated_idx on public.libraries(updated_at desc);

alter table public.libraries enable row level security;
drop policy if exists "public library read" on public.libraries;
drop policy if exists "public library write" on public.libraries;
create policy "public library read" on public.libraries for select to anon using (true);
create policy "public library write" on public.libraries for all to anon using (true) with check (true);

-- Existing Plan Your Visit libraries become 1080x1920, video-first automatically.
update public.libraries
set preset = 'video-story',
    aspect_ratio = '9:16',
    width = 1080,
    height = 1920,
    option_video_enabled = true,
    updated_at = now()
where lower(name) like '%plan%your%visit%';

-- Sermon Series remains landscape/image-first.
update public.libraries
set preset = 'image-landscape',
    aspect_ratio = '16:9',
    width = 1920,
    height = 1080,
    option_video_enabled = false,
    updated_at = now()
where id = 'sermon-series';
