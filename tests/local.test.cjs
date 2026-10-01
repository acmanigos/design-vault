const { test }=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const { indexedDB }=require('fake-indexeddb');
let account='owner';
const cache=new Map();
function load(file) {
  file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;
  const module={exports:{}};cache.set(file,module);
  const src=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const req=name=>{
    if(name==='./account')return {currentAccount:()=>account};
    if(name==='./supabase')return {supabase:null,isSupabaseConfigured:false,DESIGN_VAULT_BUCKET:'design-vault'};
    if(name.startsWith('@/'))return load(name.slice(2)+'.ts');
    if(name.startsWith('.'))return load(path.resolve(path.dirname(file),name+'.ts'));
    return require(name);
  };
  new Function('require','module','exports',src)(req,module,module.exports);return module.exports;
}
const db=load('lib/local-db.ts');
const types=load('lib/types.ts');
const permissions=load('lib/permissions.ts');
test('IndexedDB account isolation, roles, option preservation and presets',async()=>{
  global.indexedDB=indexedDB;global.window={};
  types.setDefaultLibraryId('owner-sermon-series');
  const ownerLibraries=await db.loadLocalLibraries();
  assert.equal(ownerLibraries[0].role,'owner');
  await db.putLocalLibrary({...ownerLibraries[0],role:'viewer',visibility:'shared',ownerId:'somebody'});
  assert.equal((await db.loadLocalLibrary(ownerLibraries[0].id)).role,'viewer');
  const box={id:'private-box',title:'Keep',libraryId:ownerLibraries[0].id,createdAt:'2026-01-01',updatedAt:'2026-01-01',syncStatus:'pending',favorite:true,thumbnailOptionId:'b',options:[
    {id:'b',title:'Second first',image:'data:image/webp;base64,AA',cloudImageUrl:'storage:path',videoUrl:'https://youtu.be/abcdef12345',promptUsed:'Keep prompt',notes:'Keep note',colorPalette:['#123456']},
    {id:'a',title:'First second',image:'data:image/webp;base64,BB',colorPalette:[]}
  ]};
  await db.putLocalIdeaBox(box);await db.putSyncQueue({id:box.id,operation:'upsert',updatedAt:box.updatedAt});
  const restored=await db.loadLocalIdeaBox(box.id);
  assert.deepEqual(restored.options.map(o=>o.id),['b','a']);assert.equal(restored.options[0].promptUsed,'Keep prompt');
  assert.equal(restored.thumbnailOptionId,'b');assert.equal(restored.options[0].videoUrl,box.options[0].videoUrl);
  account='friend';types.setDefaultLibraryId('friend-sermon-series');
  assert.deepEqual(await db.loadLocalIdeaBoxes(),[]);assert.deepEqual(await db.listSyncQueue(),[]);
  assert.equal((await db.loadLocalLibraries())[0].id,'friend-sermon-series');
  account='owner';assert.equal((await db.loadLocalIdeaBoxes()).length,1);
  assert.equal(permissions.canEdit({role:'viewer'}),false);assert.equal(permissions.canEdit({role:'editor'}),true);
  assert.equal(permissions.canManage({role:'editor'}),false);
  assert.deepEqual(types.libraryPresetDefaults('Plan Your Visit'),{preset:'video-story',aspectRatio:'9:16',width:1080,height:1920,optionVideoEnabled:true});
  const storage=load('lib/storage.ts');
  const editableLibrary=await storage.createLibrary('Plan Your Visit');
  const first=await storage.saveIdeaBox({...box,id:'editable-box',libraryId:editableLibrary.id});
  // Simulate a second tab/background sync changing the cached revision.
  await db.putLocalIdeaBox({...first,title:'Newer tab',updatedAt:'2099-01-01'});
  await assert.rejects(storage.saveIdeaBox({...first,title:'Stale overwrite'}),/changed while you were editing/);
  assert.equal((await db.loadLocalIdeaBox(first.id)).title,'Newer tab');
  await assert.rejects(storage.saveIdeaBox({...box,id:'viewer-write'}),/read-only/);
});
