const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const owner = '11111111-1111-4111-8111-111111111111';
const editor = '22222222-2222-4222-8222-222222222222';
const viewer = '33333333-3333-4333-8333-333333333333';
const stranger = '44444444-4444-4444-8444-444444444444';
test('migration, RLS, roles, conflicts and storage against PostgreSQL', async t => {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as
      'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    grant usage on schema auth, storage, public to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    create table storage.buckets(id text primary key,name text,public boolean);
    create table storage.objects(id text primary key,bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant select,insert,update,delete on storage.objects to anon,authenticated;
    insert into auth.users values
      ('${owner}','owner@example.test'),('${editor}','editor@example.test'),
      ('${viewer}','viewer@example.test'),('${stranger}','stranger@example.test');
  `);
  await db.exec(fs.readFileSync('supabase/schema.sql','utf8'));
  await db.exec(`
    insert into public.idea_boxes(id,title,notes) values('legacy-box','Keep this vault','Original notes');
    insert into public.idea_options(id,idea_box_id,title,image_url,prompt_used,color_palette)
    values('legacy-option','legacy-box','Keep option','https://example.supabase.co/storage/v1/object/public/design-vault/idea-boxes/legacy-box/legacy-option.webp?v=123','Original prompt',array['#FFAA00']);
    insert into storage.objects values('legacy-object','design-vault','idea-boxes/legacy-box/legacy-option.webp');
    create policy accidentally_broad_storage_read on storage.objects for select to public using(true);
    create policy accidentally_broad_storage_insert on storage.objects for insert to public with check(true);
  `);
  const migration = fs.readFileSync('supabase/auth-team-migration.sql','utf8').replace('REPLACE_WITH_OWNER_AUTH_USER_UUID',owner);
  await db.exec(migration);
  const as = async (id,role='authenticated') => {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id || '']);
    await db.exec('set role '+role);
  };
  const rows = async sql => (await db.query(sql)).rows;
  const rpc = async (entity,operation,payload,expected=null) => {
    const r=await db.query('select public.vault_write($1,$2,$3::jsonb,$4::timestamptz)::text as stamp',[entity,operation,JSON.stringify(payload),expected]);return r.rows[0].stamp;
  };
  const library = (id,visibility='private') => ({ id,name:id,preset:'video-story',aspectRatio:'9:16',width:1080,height:1920,optionVideoEnabled:true,visibility });
  const box = (id,libraryId,title='Idea') => ({ id,libraryId,title,favorite:false,thumbnailOptionId:id+'-option',options:[{ id:id+'-option',title:'Option',image:'',videoUrl:'https://youtu.be/abcdef12345',notes:'Option notes',promptUsed:'A prompt',colorPalette:['#123456'] }] });
  let sharedStamp, boxStamp;
  await t.test('migration preserves original data and assigns explicit owner',async()=>{
    const r=await rows("select b.title,b.notes,b.owner_id,o.prompt_used,o.color_palette,o.image_url from public.idea_boxes b join public.idea_options o on o.idea_box_id=b.id");
    assert.equal(r[0].owner_id,owner);assert.equal(r[0].notes,'Original notes');assert.equal(r[0].prompt_used,'Original prompt');
    assert.equal(r[0].image_url,'storage:idea-boxes/legacy-box/legacy-option.webp');
    assert.equal((await rows("select public from storage.buckets where id='design-vault'"))[0].public,false);
    await db.exec(migration); // Re-running with the same owner is non-destructive.
    assert.equal((await rows('select count(*)::int as n from public.idea_boxes'))[0].n,1);
  });
  await t.test('anonymous access is denied, including broad existing Storage policies',async()=>{
    await as(null,'anon');
    await assert.rejects(rows('select * from public.idea_boxes'),/permission denied/);
    await assert.rejects(rpc('library','upsert',library('bad')),/permission denied/);
    assert.equal((await rows('select * from storage.objects')).length,0);
    await assert.rejects(db.exec("insert into storage.objects values('bad','design-vault','bad/path')"));
  });
  await t.test('owner creates private/shared libraries and grants editor/viewer roles',async()=>{
    await as(owner);
    assert.equal((await rows('select * from public.idea_boxes')).length,1);
    sharedStamp=await rpc('library','upsert',library('team','shared'));
    await rpc('library','upsert',library('private-owner'));
    boxStamp=await rpc('box','upsert',box('team-box','team'));
    await db.query("select public.vault_set_member('team',$1,$2)",['editor@example.test','editor']);
    await db.query("select public.vault_set_member('team',$1,$2)",['viewer@example.test','viewer']);
  });
  await t.test('viewer reads shared content but cannot edit or grant permissions',async()=>{
    await as(viewer);
    assert.deepEqual((await rows('select id from public.libraries')).map(r=>r.id),['team']);
    const snap = (await rows('select public.vault_snapshot() as snapshot'))[0].snapshot;
    assert.deepEqual(snap.libraries.map(l=>l.id),['team']);
    assert.deepEqual(snap.boxes.map(b=>b.id),['team-box']);
    assert.deepEqual(snap.options.map(o=>o.id),['team-box-option']);
    await assert.rejects(rpc('box','upsert',box('team-box','team','Attack'),boxStamp),/No write access/);
    await assert.rejects(rpc('box','delete',box('team-box','team'),boxStamp),/No write access/);
    await assert.rejects(db.exec("update public.idea_boxes set title='Attack'"),/permission denied/);
    await assert.rejects(db.query("select public.vault_set_member('team',$1,'editor')",['stranger@example.test']),/Only the owner/);
    await assert.rejects(db.exec("insert into storage.objects values('viewer-image','design-vault','"+viewer+"/team/x.webp')"));
  });
  await t.test('editor writes ideas, cannot manage libraries or move ideas into their own library',async()=>{
    await as(editor);
    boxStamp=await rpc('box','upsert',box('team-box','team','Edited'),boxStamp);
    await assert.rejects(rpc('library','upsert',library('team','private'),sharedStamp),/Only the library owner/);
    await rpc('library','upsert',library('editor-private'));
    await assert.rejects(rpc('box','upsert',box('team-box','editor-private'),boxStamp),/owner of both/);
    await assert.rejects(rpc('box','upsert',box('team-box','team'), '2000-01-01'),/conflict/);
    assert.equal((await rows("select title from public.idea_boxes where id='team-box'"))[0].title,'Edited');
  });
  await t.test('storage upload path and read follow membership; unrelated private images cannot be attached',async()=>{
    await as(editor);
    const name=editor+'/team/image.webp';
    await db.query("insert into storage.objects values('team-image','design-vault',$1)",[name]);
    const payload=box('team-box','team');payload.options[0].image='storage:'+name;
    boxStamp=await rpc('box','upsert',payload,boxStamp);
    await assert.rejects(db.exec("insert into storage.objects values('wrong-prefix','design-vault','"+owner+"/team/x.webp')"));
    payload.options[0].image='storage:idea-boxes/legacy-box/legacy-option.webp';
    await assert.rejects(rpc('box','upsert',payload,boxStamp),/Image is not accessible/);
    await as(viewer);
    assert.deepEqual((await rows('select id from storage.objects')).map(r=>r.id),['team-image']);
    await as(stranger);
    assert.equal((await rows('select * from public.idea_boxes')).length,0);
    assert.equal((await rows('select * from storage.objects')).length,0);
  });
  await t.test('revocation and Private visibility take effect on database and storage',async()=>{
    await as(owner);await db.query("delete from public.library_members where library_id='team' and user_id=$1",[editor]);
    await as(editor);
    assert.equal((await rows("select * from public.idea_boxes where id='team-box'")).length,0);
    await assert.rejects(rpc('box','upsert',box('team-box','team'),boxStamp),/No write access/);
    assert.equal((await rows("select * from storage.objects where id='team-image'")).length,0);
    await as(owner);sharedStamp=await rpc('library','upsert',library('team','private'),sharedStamp);
    await as(viewer);assert.equal((await rows('select * from public.idea_boxes')).length,0);
  });
  await t.test('cross-box option overwrite rolls back atomically; deleted ideas cannot be resurrected by stale clients',async()=>{
    await as(owner);
    const bad=box('new-box','team');bad.options[0].id='legacy-option';
    await assert.rejects(rpc('box','upsert',bad),/Option belongs/);
    assert.equal((await rows("select * from public.idea_boxes where id='new-box'")).length,0);
    await rpc('box','delete',box('team-box','team'),boxStamp);
    await assert.rejects(rpc('box','upsert',box('team-box','team'),boxStamp),/deleted or access removed/);
    assert.equal((await rows("select * from public.idea_options where idea_box_id='team-box'")).length,0);
  });
  await t.test('migration rejects reassignment to a different account',async()=>{
    await db.exec('reset role');
    await assert.rejects(db.exec(migration.replaceAll(owner,stranger)),/already assigned/);
    await db.exec('rollback');
    assert.equal((await rows('select legacy_owner_id from public.vault_settings'))[0].legacy_owner_id,owner);
  });
  await db.close();
});
