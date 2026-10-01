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


-- Next run auth-team-migration.sql with your explicit owner UUID.
-- This base schema intentionally grants no anonymous access.
