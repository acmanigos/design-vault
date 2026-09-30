'use client';

import { ChangeEvent, DragEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import IdeaBoxDetail from '@/components/idea-box-detail';
import { Archive, Cloud, Database, Heart, ImagePlus, Layers3, Play, Plus, RefreshCw, Search, Trash2, Upload, Video, WifiOff, X } from 'lucide-react';
import { extractPalette } from '@/lib/palette';
import { createLibrary, deleteLibrary, getAutoSync, imageFileToStorageDataUrl, installOnlineSyncHandler, isSupabaseConfigured, loadIdeaBoxes, loadLibraries, saveIdeaBox, saveLibrary, setAutoSync, subscribeDataChanges, subscribeSyncSummary, syncNow, type SyncSummary } from '@/lib/storage';
import { DEFAULT_LIBRARY_ID, getThumbnailOption, type IdeaOption, type IdeaBox, type LibraryPreset, type VaultLibrary } from '@/lib/types';

type FileSystemEntryLike = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (success: (file: File) => void, error?: (error: DOMException) => void) => void;
  createReader?: () => { readEntries: (success: (entries: FileSystemEntryLike[]) => void, error?: (error: DOMException) => void) => void };
};

type DropGroup = { title: string; files: File[]; fromFolder: boolean };

async function readDirectoryEntries(entry: FileSystemEntryLike): Promise<FileSystemEntryLike[]> {
  if (!entry.createReader) return [];
  const reader = entry.createReader();
  const all: FileSystemEntryLike[] = [];
  while (true) {
    const batch = await new Promise<FileSystemEntryLike[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) break;
    all.push(...batch);
  }
  return all;
}

async function filesFromEntry(entry: FileSystemEntryLike): Promise<File[]> {
  if (entry.isFile && entry.file) {
    const file = await new Promise<File>((resolve, reject) => entry.file?.(resolve, reject));
    return file.type.startsWith('image/') ? [file] : [];
  }
  if (!entry.isDirectory) return [];
  const children = (await readDirectoryEntries(entry)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const nested = await Promise.all(children.map(filesFromEntry));
  return nested.flat();
}

async function getDropGroups(dataTransfer: DataTransfer): Promise<DropGroup[]> {
  const items = Array.from(dataTransfer.items ?? []);
  const entries = items
    .map((item) => {
      const getEntry = (item as DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntryLike | null }).webkitGetAsEntry;
      return getEntry?.call(item) ?? null;
    })
    .filter((entry): entry is FileSystemEntryLike => Boolean(entry));

  if (!entries.length) {
    const files = Array.from(dataTransfer.files).filter((file) => file.type.startsWith('image/'));
    return files.length ? [{ title: '', files, fromFolder: false }] : [];
  }

  const groups: DropGroup[] = [];
  const looseFiles: File[] = [];
  for (const entry of entries) {
    if (entry.isDirectory) {
      const files = await filesFromEntry(entry);
      if (files.length) groups.push({ title: entry.name, files, fromFolder: true });
    } else {
      const files = await filesFromEntry(entry);
      looseFiles.push(...files);
    }
  }
  if (looseFiles.length) groups.push({ title: '', files: looseFiles, fromFolder: false });
  return groups;
}

function IdeaBoxCard({ refItem, library, onFavorite, onOpen }: { refItem: IdeaBox; library: VaultLibrary; onFavorite: () => void; onOpen: () => void }) {
  const thumbnail = getThumbnailOption(refItem);
  if (!thumbnail) return null;
  return (
    <article className="overflow-hidden rounded-[22px] border border-white/[0.08] bg-[#111] shadow-vault transition hover:border-white/20">
      <div className="group relative overflow-hidden bg-zinc-900">
        <button type="button" onClick={onOpen} className="block w-full text-left">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumbnail.image} alt={refItem.title} className={`block w-full object-cover transition duration-500 group-hover:scale-[1.02] ${library.aspectRatio === '9:16' ? 'aspect-[9/16]' : 'aspect-[16/10]'}`} />
        </button>
        {(thumbnail.videoUrl || refItem.videoUrl) && <div className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-[10px] text-white"><Play size={11} fill="currentColor" /> Video</div>}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/55 to-transparent" />
        <button onClick={onFavorite} className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full border border-white/20 bg-black/30 text-white backdrop-blur hover:bg-black/60" aria-label="Favorite">
          <Heart size={15} fill={refItem.favorite ? 'currentColor' : 'none'} />
        </button>
      </div>
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <button type="button" onClick={onOpen} className="block max-w-full truncate text-left font-medium tracking-[-0.02em] text-zinc-100 hover:text-white">{refItem.title}</button>
            <p className="mt-1 text-xs text-zinc-500">{library.name}</p>
          </div>
          <div className="flex shrink-0 -space-x-1">
            {thumbnail.colorPalette.slice(0, 4).map((color) => <span key={color} className="h-5 w-5 rounded-full border-2 border-[#111]" style={{ backgroundColor: color }} />)}
          </div>
        </div>
        <div className="flex items-center justify-between text-[11px] text-zinc-500">
          <span>{refItem.options.length} option{refItem.options.length === 1 ? '' : 's'}</span>
          {(thumbnail.videoUrl || refItem.videoUrl) ? <span className="inline-flex items-center gap-1"><Video size={11} /> video</span> : <span>image only</span>}
        </div>
        <div className="flex items-center gap-1.5 text-[10px]">
          <span className={`h-1.5 w-1.5 rounded-full ${refItem.syncStatus === 'synced' ? 'bg-emerald-400' : refItem.syncStatus === 'error' ? 'bg-red-400' : 'bg-amber-400'}`} />
          <span className={refItem.syncStatus === 'synced' ? 'text-zinc-600' : refItem.syncStatus === 'error' ? 'text-red-300' : 'text-amber-300'}>{refItem.syncStatus === 'synced' ? 'Cloud synced' : refItem.syncStatus === 'syncing' ? 'Syncing' : refItem.syncStatus === 'error' ? 'Sync error' : refItem.syncStatus === 'pending' ? 'Waiting to sync' : 'Local only'}</span>
        </div>
      </div>
    </article>
  );
}

function NewIdeaBoxModal({ library, onClose, onSave }: { library: VaultLibrary; onClose: () => void; onSave: (ideaBox: IdeaBox) => void }) {
  const [image, setImage] = useState('');
  const [title, setTitle] = useState('');
  const [optionTitle, setOptionTitle] = useState('Option 1');
  const [source, setSource] = useState('');
  const [notes, setNotes] = useState('');
  const [promptUsed, setPromptUsed] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [palette, setPalette] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      const result = await imageFileToStorageDataUrl(file);
      setImage(result);
      if (!title) setTitle(file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '));
      setPalette(await extractPalette(result, 6));
    } catch {
      setError('Could not prepare that image. Try JPG, PNG, or WEBP.');
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!image || !title.trim()) return;
    const id = `idea-${Date.now()}`;
    const optionId = `${id}-option-1`;
    onSave({
      id,
      title: title.trim(),
      favorite: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: isSupabaseConfigured ? 'pending' : 'local',
      libraryId: library.id,
      source: source.trim() || 'Local upload',
      notes: notes.trim(),
      videoUrl: '',
      thumbnailOptionId: optionId,
      options: [{ id: optionId, title: optionTitle.trim() || 'Option 1', image, videoUrl: library.optionVideoEnabled ? videoUrl.trim() : '', promptUsed: promptUsed.trim(), notes: '', colorPalette: palette }],
    });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 p-3 backdrop-blur-sm sm:p-6">
      <form onSubmit={submit} className="mx-auto my-3 w-full max-w-4xl overflow-hidden rounded-[28px] border border-white/10 bg-[#111] shadow-2xl">
        <div className="flex items-start justify-between border-b border-white/[0.08] px-5 py-5 sm:px-7">
          <div><p className="text-xs uppercase tracking-[0.18em] text-orange-300">New idea</p><h2 className="mt-1 text-xl font-semibold tracking-[-0.03em]">Create an Idea Box</h2><p className="mt-1 text-sm text-zinc-500">Store the concept, prompt, colors, options, notes, and optional video in one place.</p></div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-zinc-500 hover:text-white"><X size={16} /></button>
        </div>
        <div className="grid lg:grid-cols-[.85fr_1.15fr]">
          <div className="border-b border-white/[0.08] p-5 sm:p-7 lg:border-b-0 lg:border-r">
            {image ? <div className="overflow-hidden rounded-2xl border border-white/10"><img src={image} alt="Preview" className="w-full" /></div> : <label className="grid min-h-[300px] cursor-pointer place-items-center rounded-2xl border border-dashed border-white/15 bg-white/[0.025] p-8 text-center"><input type="file" accept="image/*" className="hidden" onChange={handleFile} /><div><ImagePlus size={32} className="mx-auto mb-4 text-zinc-500" /><p className="text-sm font-medium text-zinc-200">Choose the first concept image</p><p className="mt-2 text-xs text-zinc-600">Colors are extracted locally in your browser.</p></div></label>}
            {image && <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-zinc-400"><input type="file" accept="image/*" className="hidden" onChange={handleFile} /><ImagePlus size={14}/> Replace image</label>}
            {busy && <p className="mt-2 text-center text-xs text-zinc-500">Preparing image…</p>}
            {error && <p className="mt-2 text-center text-xs text-red-300">{error}</p>}
          </div>
          <div className="space-y-4 p-5 sm:p-7">
            <label><span className="mb-2 block text-[10px] uppercase tracking-[0.16em] text-zinc-600">Idea Box title</span><input required value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-xl border border-white/10 bg-black/25 px-3.5 py-3 text-sm outline-none focus:border-orange-400/50" placeholder="The Other Side" /></label>
            <label><span className="mb-2 block text-[10px] uppercase tracking-[0.16em] text-zinc-600">First option title</span><input value={optionTitle} onChange={(e) => setOptionTitle(e.target.value)} className="w-full rounded-xl border border-white/10 bg-black/25 px-3.5 py-3 text-sm outline-none" /></label>
            <label><span className="mb-2 block text-[10px] uppercase tracking-[0.16em] text-zinc-600">Prompt used</span><textarea value={promptUsed} onChange={(e) => setPromptUsed(e.target.value)} rows={7} className="w-full resize-y rounded-xl border border-white/10 bg-black/25 px-3.5 py-3 font-mono text-xs leading-6 outline-none" placeholder="Paste the exact prompt you used for this design…" /></label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label><span className="mb-2 block text-[10px] uppercase tracking-[0.16em] text-zinc-600">Source</span><input value={source} onChange={(e) => setSource(e.target.value)} className="w-full rounded-xl border border-white/10 bg-black/25 px-3.5 py-3 text-sm outline-none" placeholder="ChatGPT, Pinterest, own concept…" /></label>
              {library.optionVideoEnabled && <label><span className="mb-2 block text-[10px] uppercase tracking-[0.16em] text-zinc-600">Option video URL</span><input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} className="w-full rounded-xl border border-white/10 bg-black/25 px-3.5 py-3 text-sm outline-none" placeholder="YouTube, Shorts, youtu.be, or direct video URL" /></label>}
            </div>
            <label><span className="mb-2 block text-[10px] uppercase tracking-[0.16em] text-zinc-600">Idea box notes</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full resize-y rounded-xl border border-white/10 bg-black/25 px-3.5 py-3 text-sm outline-none" placeholder="What is the sermon about? What direction do you want to explore?" /></label>
            <div><p className="mb-2 text-[10px] uppercase tracking-[0.16em] text-zinc-600">Extracted colors</p><div className="flex flex-wrap gap-2">{palette.map((color) => <div key={color} className="flex items-center gap-2 rounded-full border border-white/10 py-1 pl-1 pr-3"><span className="h-7 w-7 rounded-full border border-white/10" style={{backgroundColor: color}}/><span className="font-mono text-[10px] text-zinc-400">{color}</span></div>)}</div></div>
            <div className="flex justify-end gap-2 border-t border-white/[0.07] pt-5"><button type="button" onClick={onClose} className="rounded-xl border border-white/10 px-4 py-2.5 text-xs text-zinc-400">Cancel</button><button type="submit" disabled={!image || !title.trim()} className="rounded-xl bg-orange-500 px-5 py-2.5 text-xs font-semibold text-black disabled:opacity-40">Save Idea Box</button></div>
          </div>
        </div>
      </form>
    </div>
  );
}

export default function DesignVaultApp() {
  const [activeIdeaId, setActiveIdeaId] = useState('');

  useEffect(() => {
    const updateFromUrl = () => setActiveIdeaId(new URLSearchParams(window.location.search).get('idea') ?? '');
    updateFromUrl();
    window.addEventListener('popstate', updateFromUrl);
    return () => window.removeEventListener('popstate', updateFromUrl);
  }, []);

  const [refs, setRefs] = useState<IdeaBox[]>([]);
  const [libraries, setLibraries] = useState<VaultLibrary[]>([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState(DEFAULT_LIBRARY_ID);
  const [addingLibrary, setAddingLibrary] = useState(false);
  const [newLibraryName, setNewLibraryName] = useState('');
  const [newLibraryPreset, setNewLibraryPreset] = useState<LibraryPreset>('image-landscape');
  const [query, setQuery] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [dropActive, setDropActive] = useState(false);
  const [dropBusy, setDropBusy] = useState(false);
  const [dropStatus, setDropStatus] = useState('');
  const [sortMode, setSortMode] = useState<'newest' | 'oldest' | 'az' | 'za' | 'favorites' | 'most-options' | 'fewest-options'>('newest');
  const [autoSync, setAutoSyncState] = useState(true);
  const [syncSummary, setSyncSummary] = useState<SyncSummary>({ configured: isSupabaseConfigured, online: true, syncing: false, pendingCount: 0 });

  useEffect(() => {
    let cancelled = false;
    setAutoSyncState(getAutoSync());
    const unsubscribe = subscribeSyncSummary((value) => { if (!cancelled) setSyncSummary(value); });
    const unsubscribeData = subscribeDataChanges((boxes) => { if (!cancelled) setRefs(boxes); });
    const removeOnlineHandler = installOnlineSyncHandler((boxes) => { if (!cancelled) { setRefs(boxes); void loadLibraries().then((libs) => { if (!cancelled) setLibraries(libs); }); } });
    void (async () => {
      try {
        const [stored, storedLibraries] = await Promise.all([loadIdeaBoxes(), loadLibraries()]);
        if (cancelled) return;
        setRefs(stored);
        setLibraries(storedLibraries);
        if (isSupabaseConfigured) {
          const synced = await syncNow();
          if (!cancelled) {
            setRefs(synced);
            setLibraries(await loadLibraries());
          }
        }
      } catch {
        if (!cancelled) setSaveError('Could not load local Design Vault storage.');
      }
    })();
    return () => { cancelled = true; unsubscribe(); unsubscribeData(); removeOnlineHandler(); };
  }, []);



  useEffect(() => {
    if (!autoSync || !isSupabaseConfigured) return;
    const timer = window.setInterval(() => { if (navigator.onLine) void syncNow().then((boxes) => { setRefs(boxes); void loadLibraries().then(setLibraries); }); }, 60000);
    return () => window.clearInterval(timer);
  }, [autoSync]);

  const visibleRefs = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = refs.filter((item) => {
      if (favoritesOnly && !item.favorite) return false;
      if (!favoritesOnly && item.libraryId !== selectedLibraryId) return false;
      if (!terms.length) return true;
      const optionText = item.options.flatMap((option) => [option.title, option.promptUsed, option.notes, ...option.colorPalette]);
      const haystack = [item.title, item.source, item.notes, ...optionText].filter(Boolean).join(' ').toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });

    return [...filtered].sort((a, b) => {
      switch (sortMode) {
        case 'oldest':
          return a.createdAt.localeCompare(b.createdAt);
        case 'az':
          return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });
        case 'za':
          return b.title.localeCompare(a.title, undefined, { numeric: true, sensitivity: 'base' });
        case 'favorites':
          return Number(b.favorite) - Number(a.favorite) || b.createdAt.localeCompare(a.createdAt);
        case 'most-options':
          return b.options.length - a.options.length || b.createdAt.localeCompare(a.createdAt);
        case 'fewest-options':
          return a.options.length - b.options.length || b.createdAt.localeCompare(a.createdAt);
        case 'newest':
        default:
          return b.createdAt.localeCompare(a.createdAt);
      }
    });
  }, [refs, query, favoritesOnly, selectedLibraryId, sortMode]);

  const toggleFavorite = async (id: string) => {
    const current = refs.find((item) => item.id === id);
    if (!current) return;
    const updated = { ...current, favorite: !current.favorite };
    setRefs((items) => items.map((item) => item.id === id ? updated : item));
    try {
      const saved = await saveIdeaBox(updated);
      setRefs((items) => items.map((item) => item.id === id ? saved : item));
      setSaveError('');
    } catch { setSaveError('Design Vault could not save to local browser storage.'); }
  };

  const createIdeaBoxFromFiles = async (files: File[], folderTitle = '') => {
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    if (!imageFiles.length) return null;
    const stamp = Date.now() + Math.floor(Math.random() * 1000);
    const options: IdeaOption[] = [];
    for (let index = 0; index < imageFiles.length; index += 1) {
      const file = imageFiles[index];
      setDropStatus(`Preparing ${index + 1} of ${imageFiles.length} images...`);
      const image = await imageFileToStorageDataUrl(file);
      const colorPalette = await extractPalette(image, 6);
      options.push({
        id: `idea-${stamp}-option-${index + 1}`,
        title: `Option ${index + 1}`,
        image,
        promptUsed: '',
        notes: '',
        colorPalette,
      });
    }
    const first = options[0];
    const firstFileName = imageFiles[0].name.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ').trim();
    const title = folderTitle.trim() || firstFileName || 'New Idea';
    const ideaBox: IdeaBox = {
      id: `idea-${stamp}`,
      title,
      favorite: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: isSupabaseConfigured ? 'pending' : 'local',
      libraryId: selectedLibraryId,
      source: folderTitle ? 'Folder drag and drop' : 'Bulk drag and drop',
      notes: '',
      videoUrl: '',
      thumbnailOptionId: first.id,
      options,
    };
    return ideaBox;
  };

  const createIdeaBoxesFromDrop = async (dataTransfer: DataTransfer) => {
    if (showUpload || dropBusy) return;
    setDropBusy(true);
    setDropStatus('Reading dropped items...');
    try {
      const groups = await getDropGroups(dataTransfer);
      if (!groups.length) {
        setDropStatus('No supported images were found in that drop.');
        window.setTimeout(() => setDropStatus(''), 3000);
        return;
      }
      let boxes = 0;
      let images = 0;
      for (const group of groups) {
        const created = await createIdeaBoxFromFiles(group.files, group.fromFolder ? group.title : '');
        if (created) {
          const saved = await saveIdeaBox(created);
          setRefs((current) => [saved, ...current]);
          boxes += 1;
          images += group.files.length;
        }
      }
      setDropStatus(`${images} image${images === 1 ? '' : 's'} added across ${boxes} Idea Box${boxes === 1 ? '' : 'es'}.`);
      window.setTimeout(() => setDropStatus(''), 3200);
    } catch {
      setDropStatus('Could not read that folder or its images. Try JPG, PNG, or WEBP files.');
      window.setTimeout(() => setDropStatus(''), 3500);
    } finally {
      setDropBusy(false);
      setDropActive(false);
    }
  };

  const handleVaultDragOver = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    if (Array.from(event.dataTransfer.types).includes('Files')) setDropActive(true);
  };

  const handleVaultDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDropActive(false);
    void createIdeaBoxesFromDrop(event.dataTransfer);
  };

  const addLibrary = async () => {
    const name = newLibraryName.trim();
    if (!name) return;
    if (libraries.some((library) => library.name.toLowerCase() === name.toLowerCase())) {
      setSaveError('A library with that name already exists.');
      return;
    }
    try {
      const library = await createLibrary(name, newLibraryPreset);
      setLibraries((current) => [...current, library].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedLibraryId(library.id);
      setFavoritesOnly(false);
      setNewLibraryName('');
      setNewLibraryPreset('image-landscape');
      setAddingLibrary(false);
      setSaveError('');
    } catch {
      setSaveError('Could not create that library.');
    }
  };

  const removeLibrary = async (library: VaultLibrary) => {
    if (library.id === DEFAULT_LIBRARY_ID) return;
    const count = refs.filter((item) => item.libraryId === library.id).length;
    const message = count
      ? `Delete "${library.name}"? Its ${count} Idea Box${count === 1 ? '' : 'es'} will be moved to Sermon Series.`
      : `Delete "${library.name}"?`;
    if (!window.confirm(message)) return;
    try {
      await deleteLibrary(library.id);
      const [boxes, libs] = await Promise.all([loadIdeaBoxes(), loadLibraries()]);
      setRefs(boxes);
      setLibraries(libs);
      if (selectedLibraryId === library.id) setSelectedLibraryId(DEFAULT_LIBRARY_ID);
      setSaveError('');
    } catch {
      setSaveError('Could not delete that library.');
    }
  };

  const selectedLibrary = libraries.find((library) => library.id === selectedLibraryId) ?? libraries[0];

  const openIdea = (id: string) => {
    window.history.pushState({}, '', `${window.location.pathname}?idea=${encodeURIComponent(id)}`);
    setActiveIdeaId(id);
  };

  const closeIdea = () => {
    window.history.pushState({}, '', window.location.pathname);
    setActiveIdeaId('');
    void Promise.all([loadIdeaBoxes(), loadLibraries()]).then(([boxes, libs]) => { setRefs(boxes); setLibraries(libs); });
  };

  if (activeIdeaId) return <IdeaBoxDetail id={activeIdeaId} onClose={closeIdea} />;

  return (
    <main onDragEnter={handleVaultDragOver} onDragOver={handleVaultDragOver} onDragLeave={(event) => { if (event.currentTarget === event.target) setDropActive(false); }} onDrop={handleVaultDrop} className="relative min-h-screen bg-[#090909] text-zinc-100">
      <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-[#090909]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex shrink-0 items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-xl bg-orange-500 text-black"><Archive size={17} strokeWidth={2.5}/></span><div className="hidden sm:block"><div className="text-sm font-semibold">Design Vault</div><div className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">Idea library</div></div></div>
          <div className="mx-auto flex w-full max-w-2xl items-center rounded-full border border-white/[0.09] bg-white/[0.04] px-3.5"><Search size={15} className="text-zinc-500"/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title, prompt, notes, source, colors…" className="w-full bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-zinc-600"/></div>
          <button onClick={() => setShowUpload(true)} className="flex shrink-0 items-center gap-2 rounded-full bg-zinc-100 px-4 py-2.5 text-xs font-medium text-black"><Upload size={14}/> <span className="hidden sm:inline">New Idea Box</span></button>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-4 pt-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="inline-flex items-center gap-2 text-zinc-200"><Database size={14} className="text-orange-300"/> Local-first</span>
            {isSupabaseConfigured ? (
              <span className={`inline-flex items-center gap-2 ${syncSummary.online ? 'text-emerald-300' : 'text-amber-300'}`}>{syncSummary.online ? <Cloud size={14}/> : <WifiOff size={14}/>} {syncSummary.syncing ? 'Syncing…' : syncSummary.pendingCount ? `${syncSummary.pendingCount} change${syncSummary.pendingCount === 1 ? '' : 's'} waiting` : 'Cloud synced'}</span>
            ) : <span className="text-zinc-500">Supabase backup not configured</span>}
            {syncSummary.lastSyncedAt && <span className="text-zinc-600">Last sync {new Date(syncSummary.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
          </div>
          {isSupabaseConfigured && <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-2 text-zinc-500"><input type="checkbox" checked={autoSync} onChange={(e) => { setAutoSyncState(e.target.checked); setAutoSync(e.target.checked); }} className="accent-orange-500"/> Auto sync</label>
            <button onClick={() => void syncNow().then((boxes) => { setRefs(boxes); void loadLibraries().then(setLibraries); })} disabled={syncSummary.syncing || !syncSummary.online} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-zinc-300 disabled:opacity-40"><RefreshCw size={13} className={syncSummary.syncing ? 'animate-spin' : ''}/> Sync now</button>
          </div>}
        </div>
        {syncSummary.error && <p className="mt-2 px-1 text-xs text-amber-300">{syncSummary.error}</p>}
      </div>

      {saveError && <div className="mx-auto max-w-[1500px] px-4 pt-4 sm:px-6 lg:px-8"><div className="rounded-xl border border-red-500/20 bg-red-500/[0.08] px-4 py-3 text-sm text-red-200">{saveError}</div></div>}

      <div className="mx-auto grid max-w-[1500px] lg:grid-cols-[220px_1fr]">
        <aside className="border-b border-white/[0.07] px-4 py-5 lg:min-h-[calc(100vh-65px)] lg:border-b-0 lg:border-r lg:px-5">
          <div className="lg:sticky lg:top-24">
            <p className="mb-3 px-2 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-600">Library</p>
            <nav className="space-y-1">
              {libraries.map((library) => {
                const active = !favoritesOnly && selectedLibraryId === library.id;
                const count = refs.filter((item) => item.libraryId === library.id).length;
                return <div key={library.id} className={`group flex items-center rounded-xl ${active ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'}`}>
                  <button onClick={() => { setSelectedLibraryId(library.id); setFavoritesOnly(false); }} className={`flex min-w-0 flex-1 items-center justify-between px-2.5 py-2 text-left text-sm ${active ? 'text-white' : 'text-zinc-500'}`}><span className="flex min-w-0 items-center gap-2.5"><Layers3 size={14} className="shrink-0"/><span className="truncate">{library.name}</span></span><span className="ml-2 text-[10px] text-zinc-700">{count}</span></button>
                  {library.id !== DEFAULT_LIBRARY_ID && <button onClick={() => void removeLibrary(library)} title={`Delete ${library.name}`} className="mr-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-zinc-700 opacity-0 transition hover:bg-red-500/10 hover:text-red-300 group-hover:opacity-100"><Trash2 size={12}/></button>}
                </div>;
              })}
            </nav>
            {addingLibrary ? <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.025] p-2"><input autoFocus value={newLibraryName} onChange={(e) => setNewLibraryName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void addLibrary(); if (e.key === 'Escape') { setAddingLibrary(false); setNewLibraryName(''); } }} placeholder="Plan Your Visit" className="w-full rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-xs outline-none focus:border-orange-400/50"/><select value={newLibraryPreset} onChange={(e) => setNewLibraryPreset(e.target.value as LibraryPreset)} className="mt-2 w-full rounded-lg border border-white/10 bg-[#151515] px-2.5 py-2 text-xs text-zinc-300 outline-none"><option value="image-landscape">Design · 16:9</option><option value="video-story">Story video · 9:16</option></select><div className="mt-2 flex gap-2"><button onClick={() => void addLibrary()} className="flex-1 rounded-lg bg-orange-500 px-2 py-1.5 text-[11px] font-semibold text-black">Add</button><button onClick={() => { setAddingLibrary(false); setNewLibraryName(''); }} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-zinc-500">Cancel</button></div></div> : <button onClick={() => setAddingLibrary(true)} className="mt-3 flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-300"><Plus size={14}/> Add library</button>}
            <div className="mt-8 border-t border-white/[0.07] pt-5"><button onClick={() => setFavoritesOnly(true)} className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm ${favoritesOnly ? 'bg-white/[0.08] text-white' : 'text-zinc-500 hover:bg-white/[0.04]'}`}><Heart size={14}/> Favorites</button></div>
          </div>
        </aside>

        <section className="min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div><div className="mb-1 flex items-center gap-2 text-xs text-zinc-600"><span>Vault</span><span>/</span><span>{favoritesOnly ? 'Favorites' : (selectedLibrary?.name || 'Library')}</span></div><div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-semibold tracking-[-0.04em] text-white">{favoritesOnly ? 'Favorites' : (selectedLibrary?.name || 'Library')}</h1>{!favoritesOnly && selectedLibrary && <select value={selectedLibrary.preset} onChange={(e) => { const preset = e.target.value as LibraryPreset; const updated = preset === 'video-story' ? { ...selectedLibrary, preset, aspectRatio: '9:16' as const, width: 1080, height: 1920, optionVideoEnabled: true } : { ...selectedLibrary, preset, aspectRatio: '16:9' as const, width: 1920, height: 1080, optionVideoEnabled: false }; void saveLibrary(updated).then((saved) => setLibraries((items) => items.map((item) => item.id === saved.id ? saved : item))); }} className="rounded-xl border border-white/10 bg-[#141414] px-3 py-2 text-xs text-zinc-300 outline-none"><option value="image-landscape">Design · 16:9 · 1920×1080</option><option value="video-story">Story video · 9:16 · 1080×1920</option></select>}</div><p className="mt-1 text-sm text-zinc-500">{visibleRefs.length} Idea Box{visibleRefs.length === 1 ? '' : 'es'} · {selectedLibrary?.aspectRatio || '16:9'} · {selectedLibrary?.width || 1920}×{selectedLibrary?.height || 1080} · prompts, options, notes and colors</p></div>
            <label className="flex items-center gap-2 self-start sm:self-auto"><span className="text-xs text-zinc-600">Sort</span><select value={sortMode} onChange={(e) => setSortMode(e.target.value as typeof sortMode)} className="rounded-xl border border-white/10 bg-[#141414] px-3 py-2.5 text-xs text-zinc-300 outline-none hover:border-white/20"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="az">Title A–Z</option><option value="za">Title Z–A</option><option value="favorites">Favorites first</option><option value="most-options">Most options</option><option value="fewest-options">Fewest options</option></select></label>
          </div>
          <div className={`mb-6 rounded-2xl border border-dashed p-4 transition ${dropActive ? 'border-orange-400 bg-orange-500/[0.08]' : 'border-white/10 bg-white/[0.02]'}`}>
            <div className="flex flex-col items-center justify-center gap-2 py-3 text-center sm:flex-row sm:text-left">
              <ImagePlus size={20} className={dropActive ? 'text-orange-300' : 'text-zinc-600'} />
              <div><p className="text-sm font-medium text-zinc-300">Drop a folder or multiple images here to create a new Idea Box</p><p className="mt-0.5 text-xs text-zinc-600">Every image becomes Option 1, Option 2, Option 3... automatically.</p></div>
            </div>
            {dropStatus && <p className={`mt-2 text-center text-xs ${dropBusy ? 'text-zinc-400' : 'text-emerald-300'}`}>{dropStatus}</p>}
          </div>
          {visibleRefs.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{visibleRefs.map((item) => <IdeaBoxCard key={item.id} refItem={item} library={libraries.find((library) => library.id === item.libraryId) || selectedLibrary!} onFavorite={() => void toggleFavorite(item.id)} onOpen={() => openIdea(item.id)} />)}</div> : <div className="grid min-h-[50vh] place-items-center rounded-3xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center"><div><Archive className="mx-auto mb-4 text-zinc-700"/><h3 className="font-medium text-zinc-300">No ideas found in this library.</h3><p className="mt-2 text-sm text-zinc-600">Create a new Idea Box or try a broader search.</p></div></div>}
        </section>
      </div>
      {dropActive && !showUpload && <div className="pointer-events-none fixed inset-3 z-50 grid place-items-center rounded-[32px] border-2 border-dashed border-orange-400 bg-black/75 backdrop-blur-sm"><div className="rounded-3xl border border-orange-400/30 bg-[#111] px-10 py-8 text-center shadow-2xl"><ImagePlus size={36} className="mx-auto mb-3 text-orange-300"/><p className="text-lg font-semibold">Drop a folder or images</p><p className="mt-2 text-sm text-zinc-500">Folder name becomes the title. Its images become separate options.</p></div></div>}
      {showUpload && selectedLibrary && <NewIdeaBoxModal library={selectedLibrary} onClose={() => setShowUpload(false)} onSave={(ideaBox) => { void saveIdeaBox(ideaBox).then((saved) => { setRefs((current) => [saved, ...current]); setSaveError(''); setShowUpload(false); }).catch(() => setSaveError('Design Vault could not save to local browser storage.')); }} />}
    </main>
  );
}
