-- READ SETUP.md FIRST. Back up tables and Storage, create the owner's Auth account,
-- then replace ONLY the UUID below. This transaction never grants "first login" ownership.
begin;
select set_config('vault.migration_owner', 'e828732e-6b18-40c3-a5b8-cd9f7329abcb', true);

do $$
declare owner_uuid uuid;
begin
  owner_uuid := current_setting('vault.migration_owner')::uuid;
  if not exists(select 1 from auth.users where id = owner_uuid) then
    raise exception 'Owner must already exist in Supabase Authentication';
  end if;
end $$;

create table if not exists public.vault_settings (
  singleton boolean primary key default true check(singleton),
  legacy_owner_id uuid not null references auth.users(id)
);
insert into public.vault_settings(singleton, legacy_owner_id)
values(true, current_setting('vault.migration_owner')::uuid)
on conflict(singleton) do nothing;
do $$ begin
  if (select legacy_owner_id from public.vault_settings) <> current_setting('vault.migration_owner')::uuid then
    raise exception 'This vault was already assigned to another owner; migration aborted';
  end if;
end $$;
alter table public.vault_settings enable row level security;
revoke all on public.vault_settings from public, anon, authenticated;

alter table public.libraries add column if not exists owner_id uuid references auth.users(id);
alter table public.libraries add column if not exists visibility text not null default 'private' check(visibility in ('private','shared'));
alter table public.idea_boxes add column if not exists owner_id uuid references auth.users(id);
update public.libraries set owner_id = current_setting('vault.migration_owner')::uuid where owner_id is null;
-- Recover any legacy orphan library IDs without losing boxes.
insert into public.libraries(id, name, owner_id)
select distinct b.library_id, 'Recovered library ' || b.library_id, current_setting('vault.migration_owner')::uuid
from public.idea_boxes b where not exists(select 1 from public.libraries l where l.id = b.library_id);
update public.idea_boxes b set owner_id = l.owner_id from public.libraries l where l.id = b.library_id and b.owner_id is null;
alter table public.libraries alter column owner_id set not null;
alter table public.idea_boxes alter column owner_id set not null;
do $$ begin
  if not exists(select 1 from pg_constraint where conname = 'vault_box_library_fk' and conrelid = 'public.idea_boxes'::regclass) then
    alter table public.idea_boxes add constraint vault_box_library_fk foreign key(library_id) references public.libraries(id);
  end if;
end $$;
create table if not exists public.library_members (
  library_id text not null references public.libraries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check(role in ('editor','viewer')),
  primary key(library_id, user_id)
);
create index if not exists vault_members_user on public.library_members(user_id);
create index if not exists vault_libraries_owner on public.libraries(owner_id);

-- No object is moved or deleted. Old public image URLs become durable private paths.
update public.idea_options
set image_url = 'storage:' || split_part(regexp_replace(image_url,
  '^https://[^/]+/storage/v1/object/public/design-vault/', ''), '?', 1)
where image_url ~ '^https://[^/]+/storage/v1/object/public/design-vault/';
insert into storage.buckets(id, name, public) values('design-vault','design-vault',false)
on conflict(id) do update set public = false;

create or replace function public.vault_role(library text) returns text
language sql stable security definer set search_path = '' as $$
  select case when l.owner_id = auth.uid() then 'owner'
    when l.visibility = 'shared' then
      (select m.role from public.library_members m where m.library_id = l.id and m.user_id = auth.uid())
    else null end
  from public.libraries l where l.id = library
$$;
create or replace function public.vault_is_legacy_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.vault_settings where legacy_owner_id = auth.uid())
$$;
create or replace function public.vault_box_role(box text) returns text
language sql stable security definer set search_path = '' as $$
  select public.vault_role(library_id) from public.idea_boxes where id = box
$$;

-- Remove every old policy on these app-owned tables, not just known names.
do $$ declare p record; begin
  for p in select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public' and tablename in ('libraries','idea_boxes','idea_options','library_members')
  loop execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename); end loop;
end $$;
alter table public.libraries enable row level security;
alter table public.idea_boxes enable row level security;
alter table public.idea_options enable row level security;
alter table public.library_members enable row level security;
revoke all on public.libraries, public.idea_boxes, public.idea_options, public.library_members from public, anon, authenticated;
grant select on public.libraries, public.idea_boxes, public.idea_options, public.library_members to authenticated;
grant delete on public.library_members to authenticated;
create policy vault_library_read on public.libraries for select to authenticated using(public.vault_role(id) is not null);
create policy vault_box_read on public.idea_boxes for select to authenticated using(public.vault_role(library_id) is not null);
create policy vault_option_read on public.idea_options for select to authenticated using(public.vault_box_role(idea_box_id) is not null);
create policy vault_member_read on public.library_members for select to authenticated using(user_id = auth.uid() or public.vault_role(library_id) = 'owner');
create policy vault_member_delete on public.library_members for delete to authenticated using(public.vault_role(library_id) = 'owner');

create or replace function public.vault_members(library text)
returns table(user_id uuid, email text, role text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.vault_role(library) is distinct from 'owner' then raise exception 'Only the owner can list members'; end if;
  return query select m.user_id, u.email::text, m.role from public.library_members m join auth.users u on u.id=m.user_id where m.library_id=library;
end $$;
create or replace function public.vault_set_member(library text, member_email text, member_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare target uuid; lib public.libraries;
begin
  select * into lib from public.libraries where id=library for update;
  if lib.owner_id is distinct from auth.uid() or auth.uid() is null then raise exception 'Only the owner can invite members'; end if;
  if lib.visibility <> 'shared' then raise exception 'Set this library to Shared first'; end if;
  if member_role not in ('editor','viewer') then raise exception 'Invalid role'; end if;
  select id into target from auth.users where lower(email)=lower(trim(member_email));
  if target is null then raise exception 'Create or invite this account in Supabase Authentication first'; end if;
  if target = lib.owner_id then raise exception 'The owner already has full access'; end if;
  insert into public.library_members(library_id,user_id,role) values(library,target,member_role)
  on conflict(library_id,user_id) do update set role=excluded.role;
end $$;

create or replace function public.vault_storage_read(object_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    (split_part(object_name,'/',1)=auth.uid()::text and public.vault_role(split_part(object_name,'/',2)) in ('owner','editor'))
    or exists(select 1 from public.idea_options o join public.idea_boxes b on b.id=o.idea_box_id
      where o.image_url='storage:' || object_name and public.vault_role(b.library_id) is not null)
  )
$$;
create or replace function public.vault_storage_insert(object_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and split_part(object_name,'/',1)=auth.uid()::text
    and public.vault_role(split_part(object_name,'/',2)) in ('owner','editor')
    and array_length(string_to_array(object_name,'/'),1)=3
$$;
drop policy if exists "design vault storage read" on storage.objects;
drop policy if exists "design vault storage insert" on storage.objects;
drop policy if exists "design vault storage update" on storage.objects;
drop policy if exists "design vault storage delete" on storage.objects;
drop policy if exists vault_storage_read on storage.objects;
drop policy if exists vault_storage_insert on storage.objects;
drop policy if exists vault_storage_read_guard on storage.objects;
drop policy if exists vault_storage_insert_guard on storage.objects;
drop policy if exists vault_storage_update_guard on storage.objects;
drop policy if exists vault_storage_delete_guard on storage.objects;
create policy vault_storage_read on storage.objects for select to authenticated using(bucket_id='design-vault' and public.vault_storage_read(name));
create policy vault_storage_insert on storage.objects for insert to authenticated with check(bucket_id='design-vault' and public.vault_storage_insert(name));
-- Restrictive guards prevent unrelated permissive policies from reopening this bucket.
create policy vault_storage_read_guard on storage.objects as restrictive for select to public
  using(bucket_id <> 'design-vault' or public.vault_storage_read(name));
create policy vault_storage_insert_guard on storage.objects as restrictive for insert to public
  with check(bucket_id <> 'design-vault' or public.vault_storage_insert(name));
create policy vault_storage_update_guard on storage.objects as restrictive for update to public
  using(bucket_id <> 'design-vault') with check(bucket_id <> 'design-vault');
create policy vault_storage_delete_guard on storage.objects as restrictive for delete to public
  using(bucket_id <> 'design-vault');

-- Atomic content writes, with explicit authorization and optimistic concurrency.
-- Direct REST inserts/updates/deletes are revoked above.
create or replace function public.vault_write(entity text, operation text, payload jsonb, expected timestamptz)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); item_id text := payload->>'id'; target_library text;
  lib public.libraries; box public.idea_boxes; option jsonb;
  stamp timestamptz := clock_timestamp(); exists_before boolean; ordinal integer := 0;
begin
  if uid is null then raise exception 'Sign in required'; end if;
  if operation not in ('upsert','delete') or entity not in ('library','box') then raise exception 'Invalid operation'; end if;
  if item_id is null or length(item_id)>200 or item_id !~ '^[a-zA-Z0-9_-]+$' then raise exception 'Invalid ID'; end if;
  -- Serializes concurrent new-ID inserts as well as existing-row writes.
  perform pg_advisory_xact_lock(hashtextextended(entity || ':' || item_id, 0));
  if entity='library' then
    select * into lib from public.libraries where id=item_id for update;
    exists_before := found;
    if exists_before and lib.owner_id <> uid then raise exception 'Only the library owner can change it'; end if;
    if exists_before and (expected is null or expected <> lib.updated_at) then raise exception 'Library conflict: newer cloud changes exist. Export your draft and reload the cloud version'; end if;
    if not exists_before and expected is not null then raise exception 'Library was deleted or access removed'; end if;
    if operation='delete' then
      if exists(select 1 from public.idea_boxes where library_id=item_id) then raise exception 'Sync all moved ideas before deleting the library'; end if;
      if item_id='sermon-series' or item_id=uid::text || '-sermon-series' then raise exception 'Default library cannot be deleted'; end if;
      delete from public.libraries where id=item_id;
      return stamp;
    end if;
    if payload->>'preset' not in ('image-landscape','video-story') or payload->>'aspectRatio' not in ('16:9','9:16') then raise exception 'Invalid library preset'; end if;
    insert into public.libraries(id,name,preset,aspect_ratio,width,height,option_video_enabled,owner_id,visibility,created_at,updated_at)
    values(item_id,payload->>'name',payload->>'preset',payload->>'aspectRatio',(payload->>'width')::int,(payload->>'height')::int,
      (payload->>'optionVideoEnabled')::boolean,uid,coalesce(payload->>'visibility','private'),coalesce((payload->>'createdAt')::timestamptz,stamp),stamp)
    on conflict(id) do update set name=excluded.name,preset=excluded.preset,aspect_ratio=excluded.aspect_ratio,width=excluded.width,height=excluded.height,
      option_video_enabled=excluded.option_video_enabled,visibility=excluded.visibility,updated_at=stamp;
    return stamp;
  end if;
  select * into box from public.idea_boxes where id=item_id for update;
  exists_before := found;
  target_library := payload->>'libraryId';
  -- Lock relevant libraries so visibility/access changes cannot race this write.
  perform 1 from public.libraries where id in (target_library,box.library_id) order by id for share;
  if exists_before and coalesce(public.vault_role(box.library_id),'') not in ('owner','editor') then raise exception 'No write access to this idea'; end if;
  if exists_before and (expected is null or expected <> box.updated_at) then raise exception 'Idea conflict: newer cloud changes exist. Export your draft and reload the cloud version'; end if;
  if not exists_before and expected is not null then raise exception 'Idea was deleted or access removed'; end if;
  if operation='delete' then delete from public.idea_boxes where id=item_id; return stamp; end if;
  if coalesce(public.vault_role(target_library),'') not in ('owner','editor') then raise exception 'This library is read-only'; end if;
  if exists_before and box.library_id <> target_library and
    (public.vault_role(box.library_id) <> 'owner' or public.vault_role(target_library) <> 'owner') then
    raise exception 'Only the owner of both libraries can move an idea';
  end if;
  if jsonb_typeof(payload->'options') is distinct from 'array' then raise exception 'Options array required'; end if;
  if exists(select 1 from jsonb_array_elements(payload->'options') x group by x->>'id' having count(*)>1) then raise exception 'Duplicate option IDs'; end if;
  for option in select * from jsonb_array_elements(payload->'options') loop
    if option->>'id' is null or option->>'id' !~ '^[a-zA-Z0-9_-]+$' then raise exception 'Invalid option ID'; end if;
    if exists(select 1 from public.idea_options where id=option->>'id' and idea_box_id<>item_id) then raise exception 'Option belongs to another idea'; end if;
    if starts_with(coalesce(option->>'image',''),'storage:') and not coalesce(public.vault_storage_read(substr(option->>'image',9)),false) then raise exception 'Image is not accessible'; end if;
    if coalesce(option->>'image','') <> '' and option->>'image' !~ '^(storage:|https://)' then raise exception 'Invalid image location'; end if;
  end loop;
  insert into public.idea_boxes(id,title,favorite,library_id,source,notes,video_url,thumbnail_option_id,owner_id,created_at,updated_at)
  values(item_id,payload->>'title',coalesce((payload->>'favorite')::boolean,false),target_library,coalesce(payload->>'source',''),coalesce(payload->>'notes',''),
    coalesce(payload->>'videoUrl',''),payload->>'thumbnailOptionId',coalesce(box.owner_id,uid),coalesce((payload->>'createdAt')::timestamptz,stamp),stamp)
  on conflict(id) do update set title=excluded.title,favorite=excluded.favorite,library_id=excluded.library_id,source=excluded.source,
    notes=excluded.notes,video_url=excluded.video_url,thumbnail_option_id=excluded.thumbnail_option_id,updated_at=stamp;
  for option in select * from jsonb_array_elements(payload->'options') loop
    insert into public.idea_options(id,idea_box_id,title,image_url,video_url,prompt_used,notes,color_palette,sort_order,updated_at)
    values(option->>'id',item_id,option->>'title',coalesce(option->>'image',''),coalesce(option->>'videoUrl',''),coalesce(option->>'promptUsed',''),
      coalesce(option->>'notes',''),array(select jsonb_array_elements_text(option->'colorPalette')),ordinal,stamp)
    on conflict(id) do update set title=excluded.title,image_url=excluded.image_url,video_url=excluded.video_url,prompt_used=excluded.prompt_used,
      notes=excluded.notes,color_palette=excluded.color_palette,sort_order=excluded.sort_order,updated_at=stamp
      where public.idea_options.idea_box_id=item_id;
    if not found then raise exception 'Option belongs to another idea'; end if;
    ordinal := ordinal+1;
  end loop;
  delete from public.idea_options where idea_box_id=item_id and id not in(select x->>'id' from jsonb_array_elements(payload->'options') x);
  return stamp;
end $$;

-- SECURITY DEFINER functions are never executable anonymously (including default PUBLIC grants).
-- SECURITY INVOKER keeps table RLS active inside this single-statement snapshot.
create or replace function public.vault_snapshot() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'libraries', coalesce((select jsonb_agg(to_jsonb(l) order by l.name) from public.libraries l), '[]'::jsonb),
    'members', coalesce((select jsonb_agg(to_jsonb(m)) from public.library_members m where m.user_id=auth.uid()), '[]'::jsonb),
    'boxes', coalesce((select jsonb_agg(to_jsonb(b) order by b.created_at desc) from public.idea_boxes b), '[]'::jsonb),
    'options', coalesce((select jsonb_agg(to_jsonb(o) order by o.sort_order) from public.idea_options o), '[]'::jsonb)
  )
$$;
revoke all on function public.vault_snapshot() from public, anon;
grant execute on function public.vault_snapshot() to authenticated;

revoke all on function public.vault_role(text), public.vault_box_role(text), public.vault_is_legacy_owner(),
 public.vault_members(text), public.vault_set_member(text,text,text), public.vault_storage_read(text),
 public.vault_storage_insert(text), public.vault_write(text,text,jsonb,timestamptz) from public, anon;
grant execute on function public.vault_role(text), public.vault_box_role(text), public.vault_is_legacy_owner(),
 public.vault_members(text), public.vault_set_member(text,text,text), public.vault_storage_read(text),
 public.vault_storage_insert(text), public.vault_write(text,text,jsonb,timestamptz) to authenticated;
-- Storage's anonymous restrictive guard must evaluate to false, rather than an EXECUTE error.
grant execute on function public.vault_storage_read(text), public.vault_storage_insert(text) to anon;
commit;
