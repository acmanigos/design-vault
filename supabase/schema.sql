-- Design Vault: multi-library Idea Box schema
-- Safe to run on an existing Design Vault project.

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

create table if not exists public.idea_boxes (
  id text primary key,
  title text not null,
  favorite boolean not null default false,
  created_at timestamptz not null default now(),
  library_id text not null default 'sermon-series',
  source text not null default '',
  notes text not null default '',
  video_url text not null default '',
  thumbnail_option_id text,
  updated_at timestamptz not null default now()
);

alter table public.idea_boxes add column if not exists library_id text not null default 'sermon-series';

create table if not exists public.idea_options (
  id text primary key,
  idea_box_id text not null references public.idea_boxes(id) on delete cascade,
  title text not null,
  image_url text not null,
  video_url text not null default '',
  prompt_used text not null default '',
  notes text not null default '',
  color_palette text[] not null default '{}',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.idea_options add column if not exists video_url text not null default '';

create index if not exists idea_options_idea_box_id_idx on public.idea_options(idea_box_id);
create index if not exists idea_options_sort_idx on public.idea_options(idea_box_id, sort_order);
create index if not exists idea_boxes_updated_idx on public.idea_boxes(updated_at desc);
create index if not exists idea_boxes_library_idx on public.idea_boxes(library_id);
create index if not exists libraries_updated_idx on public.libraries(updated_at desc);

alter table public.idea_boxes enable row level security;
alter table public.idea_options enable row level security;
alter table public.libraries enable row level security;

drop policy if exists "public idea box read" on public.idea_boxes;
drop policy if exists "public idea box write" on public.idea_boxes;
drop policy if exists "public idea option read" on public.idea_options;
drop policy if exists "public idea option write" on public.idea_options;
drop policy if exists "public library read" on public.libraries;
drop policy if exists "public library write" on public.libraries;

create policy "public idea box read" on public.idea_boxes for select to anon using (true);
create policy "public idea box write" on public.idea_boxes for all to anon using (true) with check (true);
create policy "public idea option read" on public.idea_options for select to anon using (true);
create policy "public idea option write" on public.idea_options for all to anon using (true) with check (true);
create policy "public library read" on public.libraries for select to anon using (true);
create policy "public library write" on public.libraries for all to anon using (true) with check (true);

insert into storage.buckets (id, name, public)
values ('design-vault', 'design-vault', true)
on conflict (id) do update set public = true;

drop policy if exists "design vault storage read" on storage.objects;
drop policy if exists "design vault storage insert" on storage.objects;
drop policy if exists "design vault storage update" on storage.objects;
drop policy if exists "design vault storage delete" on storage.objects;

create policy "design vault storage read" on storage.objects
  for select to anon using (bucket_id = 'design-vault');
create policy "design vault storage insert" on storage.objects
  for insert to anon with check (bucket_id = 'design-vault');
create policy "design vault storage update" on storage.objects
  for update to anon using (bucket_id = 'design-vault') with check (bucket_id = 'design-vault');
create policy "design vault storage delete" on storage.objects
  for delete to anon using (bucket_id = 'design-vault');
