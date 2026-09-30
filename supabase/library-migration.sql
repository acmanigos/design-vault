-- Add multi-library support to an existing Design Vault Supabase project.
-- Run this once in Supabase Dashboard -> SQL Editor.

create table if not exists public.libraries (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.libraries (id, name)
values ('sermon-series', 'Sermon Series')
on conflict (id) do nothing;

alter table public.idea_boxes
  add column if not exists library_id text not null default 'sermon-series';

create index if not exists idea_boxes_library_idx on public.idea_boxes(library_id);
create index if not exists libraries_updated_idx on public.libraries(updated_at desc);

alter table public.libraries enable row level security;

drop policy if exists "public library read" on public.libraries;
drop policy if exists "public library write" on public.libraries;

create policy "public library read" on public.libraries
  for select to anon using (true);

create policy "public library write" on public.libraries
  for all to anon using (true) with check (true);
