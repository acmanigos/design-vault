'use client';

import { canEdit, canManage } from '@/lib/permissions';
import { useRouter } from 'next/navigation';
import { ChangeEvent, DragEvent, FormEvent, MouseEvent, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Copy, GripVertical, Heart, ImagePlus, Pencil, Plus, Trash2, X } from 'lucide-react';
import { deleteIdeaBox, loadIdeaBox, loadLibraries, saveIdeaBox, imageFileToStorageDataUrl, subscribeDataChanges } from '@/lib/storage';
import { extractPalette } from '@/lib/palette';
import { resolveVideoSource } from '@/lib/video';
import type { IdeaOption, IdeaBox, VaultLibrary } from '@/lib/types';

function ColorPaletteEditor({ colors, onChange }: { colors: string[]; onChange: (colors: string[]) => void }) {
  const [newColor, setNewColor] = useState('#FF6B00');
  const normalize = (value: string) => /^#[0-9A-F]{6}$/i.test(value) ? value.toUpperCase() : '#000000';
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {colors.map((color, index) => (
          <div key={`${color}-${index}`} className="group flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 p-1.5 pr-2">
            <label className="relative h-9 w-9 cursor-pointer overflow-hidden rounded-lg border border-white/10 shadow-inner">
              <span className="absolute inset-0" style={{ backgroundColor: normalize(color) }} />
              <input type="color" value={normalize(color)} onChange={(e) => onChange(colors.map((item, i) => i === index ? e.target.value.toUpperCase() : item))} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
            </label>
            <span className="font-mono text-[11px] uppercase text-zinc-300">{normalize(color)}</span>
            <button type="button" onClick={() => onChange(colors.filter((_, i) => i !== index))} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-600 hover:bg-white/[0.06] hover:text-zinc-200"><X size={12}/></button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/20 p-2">
        <label className="relative h-9 w-9 cursor-pointer overflow-hidden rounded-lg border border-white/10"><span className="absolute inset-0" style={{ backgroundColor: newColor }} /><input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value.toUpperCase())} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" /></label>
        <input value={newColor} onChange={(e) => setNewColor(e.target.value.toUpperCase())} className="w-24 rounded-lg border border-white/10 bg-[#111] px-2.5 py-2 font-mono text-xs uppercase outline-none" />
        <button type="button" onClick={() => { const c = normalize(newColor); if (!colors.includes(c)) onChange([...colors, c]); }} className="rounded-lg bg-white px-3 py-2 text-xs font-medium text-black">Add color</button>
      </div>
    </div>
  );
}

function OptionEditor({ initial, adding, videoEnabled, onCancel, onSave }: { initial: IdeaOption; adding: boolean; videoEnabled: boolean; onCancel: () => void; onSave: (option: IdeaOption) => void }) {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const handleImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const image = await imageFileToStorageDataUrl(file);
      const colors = await extractPalette(image, 6);
      setDraft((current) => ({ ...current, image, cloudImageUrl: undefined, colorPalette: colors }));
    } finally { setBusy(false); }
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (draft.image && draft.title.trim()) onSave({ ...draft, title: draft.title.trim() }); }} className="space-y-5">
      <div className="flex items-start justify-between"><div><p className="text-xs uppercase tracking-[0.18em] text-orange-300">{adding ? 'Add option' : 'Edit option'}</p><h2 className="mt-1 text-xl font-semibold">{adding ? 'Add another visual idea' : draft.title}</h2></div><button type="button" onClick={onCancel} className="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-zinc-500"><X size={15}/></button></div>
      {draft.image ? <div className="overflow-hidden rounded-2xl border border-white/10"><img src={draft.image} alt="Option preview" className="w-full" /></div> : null}
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-zinc-400"><input type="file" accept="image/*" className="hidden" onChange={handleImage}/><ImagePlus size={14}/>{draft.image ? 'Replace image' : 'Choose image'}{busy ? '…' : ''}</label>
      <label><span className="mb-2 block text-[10px] uppercase tracking-[0.16em] text-zinc-600">Option title</span><input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="w-full rounded-xl border border-white/10 bg-black/25 px-3.5 py-3 text-sm outline-none" /></label>
      {videoEnabled && <label><span className="mb-2 block text-[10px] uppercase tracking-[0.16em] text-zinc-600">Video URL</span><input value={draft.videoUrl ?? ''} onChange={(e) => setDraft({ ...draft, videoUrl: e.target.value })} className="w-full rounded-xl border border-white/10 bg-black/25 px-3.5 py-3 text-sm outline-none" placeholder="YouTube, Shorts, youtu.be, or direct .mp4/.webm URL"/><span className="mt-2 block text-[11px] text-zinc-600">Each option can link to its own video version.</span></label>}
      <label><span className="mb-2 block text-[10px] uppercase tracking-[0.16em] text-zinc-600">Prompt used</span><textarea value={draft.promptUsed ?? ''} onChange={(e) => setDraft({ ...draft, promptUsed: e.target.value })} rows={10} className="w-full resize-y rounded-xl border border-white/10 bg-black/25 px-3.5 py-3 font-mono text-xs leading-6 outline-none" placeholder="Paste the exact prompt used for this option…" /></label>
      <label><span className="mb-2 block text-[10px] uppercase tracking-[0.16em] text-zinc-600">Option notes</span><textarea value={draft.notes ?? ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} rows={4} className="w-full resize-y rounded-xl border border-white/10 bg-black/25 px-3.5 py-3 text-sm outline-none" placeholder="What worked? What would you change?" /></label>
      <div><span className="mb-2 block text-[10px] uppercase tracking-[0.16em] text-zinc-600">Color palette</span><ColorPaletteEditor colors={draft.colorPalette} onChange={(colorPalette) => setDraft({ ...draft, colorPalette })}/></div>
      <div className="flex justify-end gap-2 border-t border-white/[0.07] pt-4"><button type="button" onClick={onCancel} className="rounded-xl border border-white/10 px-4 py-2.5 text-xs text-zinc-400">Cancel</button><button type="submit" disabled={!draft.image || !draft.title.trim()} className="rounded-xl bg-orange-500 px-5 py-2.5 text-xs font-semibold text-black disabled:opacity-40">{adding ? 'Add option' : 'Save changes'}</button></div>
    </form>
  );
}

export default function IdeaBoxDetail({ id, onClose }: { id: string; onClose?: () => void }) {
  const router = useRouter();
  const goBack = () => { if (onClose) onClose(); else router.push('/'); };
  const [refItem, setRefItem] = useState<IdeaBox | null>(null);
  const [libraries, setLibraries] = useState<VaultLibrary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [editingBox, setEditingBox] = useState(false);
  const [editingOption, setEditingOption] = useState(false);
  const [addingOption, setAddingOption] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pasteStatus, setPasteStatus] = useState('');
  const [pasteBusy, setPasteBusy] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [dropBusy, setDropBusy] = useState(false);
  const [dropStatus, setDropStatus] = useState('');
  const [dragOptionId, setDragOptionId] = useState('');
  const [dragOverOptionId, setDragOverOptionId] = useState('');
  useEffect(() => {
    const unsubscribe = subscribeDataChanges(boxes => {
      const latest = boxes.find(box => box.id === id) || null;
      if (!latest || (!editingBox && !editingOption && !addingOption)) setRefItem(latest);
      void loadLibraries().then(setLibraries);
    });
    return () => { unsubscribe(); };
  }, [id, editingBox, editingOption, addingOption]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [current, storedLibraries] = await Promise.all([loadIdeaBox(id), loadLibraries()]);
      if (cancelled) return;
      setRefItem(current);
      setLibraries(storedLibraries);
      setSelectedId(current?.options[0]?.id ?? '');
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !editingBox && !editingOption && !addingOption) goBack(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router, editingBox, editingOption, addingOption]);

  const selectedOption = refItem?.options.find((option) => option.id === selectedId) ?? refItem?.options[0];
  const selectedLibrary = libraries.find((library) => library.id === refItem?.libraryId);
  const editable = canEdit(selectedLibrary);
  const isStoryLibrary = selectedLibrary?.preset === 'video-story';
  const activeVideoUrl = selectedOption?.videoUrl || refItem?.videoUrl || '';
  const videoSource = useMemo(() => resolveVideoSource(activeVideoUrl), [activeVideoUrl]);
  const [boxTitle, setBoxTitle] = useState('');
  const [boxSource, setBoxSource] = useState('');
  const [boxNotes, setBoxNotes] = useState('');
  const [boxLibraryId, setBoxLibraryId] = useState('sermon-series');

  useEffect(() => {
    if (!refItem) return;
    setBoxTitle(refItem.title); setBoxSource(refItem.source ?? ''); setBoxNotes(refItem.notes ?? ''); setBoxLibraryId(refItem.libraryId);
  }, [refItem?.id]);

  const persist = async (updated: IdeaBox) => {
    if (!editable) return;
    try {
      const saved = await saveIdeaBox(updated);
      setRefItem(saved);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Design Vault could not save this change.');
      throw new Error('Save failed');
    }
  };

  const deleteBox = async () => {
    if (!refItem || !window.confirm(`Delete “${refItem.title}” and all of its options?`)) return;
    await deleteIdeaBox(refItem.id); goBack();
  };

  const saveBox = async (event: FormEvent) => {
    event.preventDefault(); if (!refItem || !boxTitle.trim()) return;
    await persist({ ...refItem, title: boxTitle.trim(), libraryId: boxLibraryId, source: boxSource.trim(), notes: boxNotes.trim() });
    setEditingBox(false);
  };

  const saveOption = async (option: IdeaOption) => {
    if (!refItem) return;
    if (addingOption) {
      const updated = { ...refItem, options: [...refItem.options, option] };
      await persist(updated); setSelectedId(option.id); setAddingOption(false); return;
    }
    const options = refItem.options.map((item) => item.id === option.id ? option : item);
    await persist({ ...refItem, options });
    setEditingOption(false);
  };

  const deleteOption = async () => {
    if (!refItem || !selectedOption || refItem.options.length <= 1) { window.alert('An Idea Box needs at least one option.'); return; }
    if (!window.confirm(`Delete “${selectedOption.title}”?`)) return;
    const options = refItem.options.filter((item) => item.id !== selectedOption.id);
    const nextSelected = options[0];
    const thumbnailOptionId = selectedOption.id === refItem.thumbnailOptionId ? nextSelected.id : refItem.thumbnailOptionId;
    await persist({ ...refItem, options, thumbnailOptionId });
    setSelectedId(nextSelected.id);
  };

  const setAsThumbnail = async () => {
    if (!refItem || !selectedOption) return;
    await persist({ ...refItem, thumbnailOptionId: selectedOption.id });
  };

  const copyPrompt = async () => {
    if (!selectedOption?.promptUsed) return;
    await navigator.clipboard.writeText(selectedOption.promptUsed); setCopied(true); setTimeout(() => setCopied(false), 1200);
  };

  useEffect(() => {
    if (!refItem || editingBox || editingOption || addingOption) return;

    const onPaste = async (event: ClipboardEvent) => {
      if (!editable) return;
      const imageItem = Array.from(event.clipboardData?.items ?? []).find((item) => item.type.startsWith('image/'));
      const file = imageItem?.getAsFile();
      if (!file) return;

      event.preventDefault();
      setPasteBusy(true);
      setPasteStatus('Adding pasted image…');
      try {
        const image = await imageFileToStorageDataUrl(file);
        const colorPalette = await extractPalette(image, 6);
        const option: IdeaOption = {
          id: `${refItem.id}-option-${Date.now()}`,
          title: `Option ${refItem.options.length + 1}`,
          image,
          videoUrl: '',
          promptUsed: '',
          notes: '',
          colorPalette,
        };
        const updated = { ...refItem, options: [...refItem.options, option] };
        await persist(updated);
        setSelectedId(option.id);
        setPasteStatus(`${option.title} added from clipboard`);
        window.setTimeout(() => setPasteStatus(''), 2200);
      } catch {
        setPasteStatus('Could not add the pasted image.');
        window.setTimeout(() => setPasteStatus(''), 2600);
      } finally {
        setPasteBusy(false);
      }
    };

    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [refItem, editingBox, editingOption, addingOption, editable]);

  const addDroppedFiles = async (files: File[]) => {
    if (!editable) return;
    if (!refItem || editingBox || editingOption || addingOption || dropBusy) return;
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    if (!imageFiles.length) return;
    setDropBusy(true);
    setDropStatus(`Adding 0 of ${imageFiles.length} images...`);
    try {
      const newOptions: IdeaOption[] = [];
      for (let index = 0; index < imageFiles.length; index += 1) {
        const file = imageFiles[index];
        setDropStatus(`Adding ${index + 1} of ${imageFiles.length} images...`);
        const image = await imageFileToStorageDataUrl(file);
        const colorPalette = await extractPalette(image, 6);
        newOptions.push({
          id: `${refItem.id}-option-${Date.now()}-${index}`,
          title: `Option ${refItem.options.length + index + 1}`,
          image,
          videoUrl: '',
          promptUsed: '',
          notes: '',
          colorPalette,
        });
      }
      const updated = { ...refItem, options: [...refItem.options, ...newOptions] };
      await persist(updated);
      setSelectedId(newOptions[0].id);
      setDropStatus(`${newOptions.length} option${newOptions.length === 1 ? '' : 's'} added.`);
      window.setTimeout(() => setDropStatus(''), 2600);
    } catch {
      setDropStatus('Could not add the dropped images.');
      window.setTimeout(() => setDropStatus(''), 3000);
    } finally {
      setDropBusy(false);
      setDropActive(false);
    }
  };

  const optionDragOver = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (Array.from(event.dataTransfer.types).includes('Files')) setDropActive(true);
  };

  const optionDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDropActive(false);
    if (Array.from(event.dataTransfer.types).includes('Files')) {
      void addDroppedFiles(Array.from(event.dataTransfer.files));
    }
  };

  const reorderOptions = async (sourceId: string, targetId: string) => {
    if (!editable) return;
    if (!refItem || !sourceId || !targetId || sourceId === targetId) return;
    const sourceIndex = refItem.options.findIndex((option) => option.id === sourceId);
    const targetIndex = refItem.options.findIndex((option) => option.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;

    const options = [...refItem.options];
    const [moved] = options.splice(sourceIndex, 1);
    options.splice(targetIndex, 0, moved);
    const renumbered = options.map((option, index) => ({
      ...option,
      title: /^Option\s+\d+$/i.test(option.title.trim()) ? `Option ${index + 1}` : option.title,
    }));

    setDragOptionId('');
    setDragOverOptionId('');
    await persist({ ...refItem, options: renumbered });
  };

  const optionCardDragStart = (event: DragEvent<HTMLDivElement>, optionId: string) => {
    setDragOptionId(optionId);
    setDragOverOptionId(optionId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-design-vault-option', optionId);
    event.dataTransfer.setData('text/plain', optionId);
  };

  const optionCardDragOver = (event: DragEvent<HTMLDivElement>, optionId: string) => {
    if (!dragOptionId || Array.from(event.dataTransfer.types).includes('Files')) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    if (dragOverOptionId !== optionId) setDragOverOptionId(optionId);
  };

  const optionCardDrop = (event: DragEvent<HTMLDivElement>, targetId: string) => {
    if (Array.from(event.dataTransfer.types).includes('Files')) return;
    event.preventDefault();
    event.stopPropagation();
    const sourceId = event.dataTransfer.getData('application/x-design-vault-option') || dragOptionId;
    void reorderOptions(sourceId, targetId);
  };

  const optionCardDragEnd = () => {
    setDragOptionId('');
    setDragOverOptionId('');
  };

  const outsideBack = (event: MouseEvent<HTMLElement>) => {
    if (event.target === event.currentTarget && !editingBox && !editingOption && !addingOption) goBack();
  };

  if (!loaded) return <main className="grid min-h-screen place-items-center bg-[#090909] text-zinc-500">Loading…</main>;
  if (!refItem) return <main className="grid min-h-screen place-items-center bg-[#090909] text-zinc-100"><div className="text-center"><p>Idea Box not found.</p><button type="button" onClick={goBack} className="mt-3 inline-block text-orange-300">Back to vault</button></div></main>;

  const emptyOption: IdeaOption = { id: `option-${Date.now()}`, title: `Option ${refItem.options.length + 1}`, image: '', videoUrl: '', promptUsed: '', notes: '', colorPalette: [] };

  return (
    <main onMouseDown={outsideBack} className="min-h-screen bg-[#090909] p-4 text-zinc-100 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[1550px]" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <button onClick={goBack} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-400 hover:text-white"><ArrowLeft size={15}/> Back to vault</button>
          <div className="flex gap-2"><button disabled={!editable} onClick={() => persist({ ...refItem, favorite: !refItem.favorite })} className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.03]"><Heart size={16} fill={refItem.favorite ? 'currentColor' : 'none'}/></button><button disabled={!editable} onClick={() => setEditingBox(true)} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 text-sm"><Pencil size={14}/> Edit box</button><button disabled={!editable} onClick={deleteBox} className="inline-flex items-center gap-2 rounded-full bg-orange-500 px-4 text-sm font-medium text-black"><Trash2 size={14}/> Delete box</button></div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="min-w-0 space-y-5">
            <div className="overflow-hidden rounded-[26px] border border-white/10 bg-[#111]">
              {videoSource.type === 'youtube' ? (
                <iframe
                  src={videoSource.embedUrl}
                  title={`${refItem.title} video`}
                  className={isStoryLibrary ? 'mx-auto aspect-[9/16] max-h-[760px] w-auto bg-black' : 'aspect-video w-full bg-black'}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              ) : videoSource.type === 'direct' ? (
                <video controls poster={selectedOption?.image} className={isStoryLibrary ? 'mx-auto aspect-[9/16] max-h-[760px] w-auto bg-black object-contain' : 'aspect-video w-full bg-black object-contain'} src={videoSource.url} />
              ) : (
                <img src={selectedOption?.image || ''} alt={selectedOption?.title || refItem.title} className={isStoryLibrary ? 'mx-auto block max-h-[760px] w-auto max-w-full object-contain' : 'block max-h-[680px] w-full object-contain'} />
              )}
            </div>
            <section onDragEnter={optionDragOver} onDragOver={optionDragOver} onDragLeave={(event) => { if (event.currentTarget === event.target) setDropActive(false); }} onDrop={optionDrop} className={`relative rounded-[26px] border bg-[#111] p-3 transition sm:p-4 ${dropActive ? 'border-orange-400' : 'border-white/10'}`}>
              <div className="mb-3 flex items-center justify-between gap-3 px-1"><div><p className="text-[11px] font-medium uppercase tracking-[0.18em] text-orange-300">Options</p><p className="mt-1 text-xs text-zinc-600">Click an option to view its prompt, notes, and colors. Paste with Ctrl+V, or drag multiple images here to add them in bulk.</p>{pasteStatus && <p className={`mt-2 text-xs ${pasteBusy ? 'text-zinc-400' : 'text-emerald-300'}`}>{pasteStatus}</p>}{dropStatus && <p className={`mt-2 text-xs ${dropBusy ? 'text-zinc-400' : 'text-emerald-300'}`}>{dropStatus}</p>}</div><button disabled={!editable} onClick={() => setAddingOption(true)} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs text-zinc-300"><Plus size={13}/> Add option</button></div>
              <div className={`mb-3 rounded-2xl border border-dashed px-4 py-3 text-center text-xs transition ${dropActive ? 'border-orange-400 bg-orange-500/[0.08] text-orange-200' : 'border-white/10 bg-black/10 text-zinc-600'}`}>{dropBusy ? dropStatus || 'Adding images...' : 'Drop multiple images here to add them as new options'}</div>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
                {refItem.options.map((option) => {
                  const active = option.id === selectedOption?.id;
                  const isThumbnail = option.id === refItem.thumbnailOptionId;
                  const isDragging = option.id === dragOptionId;
                  const isDragTarget = Boolean(dragOptionId) && option.id === dragOverOptionId && option.id !== dragOptionId;
                  return (
                    <div
                      key={option.id}
                      draggable={editable}
                      onDragStart={(event) => optionCardDragStart(event, option.id)}
                      onDragOver={(event) => optionCardDragOver(event, option.id)}
                      onDrop={(event) => optionCardDrop(event, option.id)}
                      onDragEnd={optionCardDragEnd}
                      className={`group overflow-hidden rounded-2xl border text-left transition ${active ? 'border-orange-400' : 'border-white/10 hover:border-white/20'} ${isDragging ? 'opacity-40' : 'opacity-100'} ${isDragTarget ? 'ring-2 ring-orange-400/70 ring-offset-2 ring-offset-[#111]' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-2 px-2 py-2">
                        <button type="button" onClick={() => setSelectedId(option.id)} className="min-w-0 flex-1 truncate px-1 text-left text-xs font-medium text-white">{option.title}</button>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {isThumbnail && <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[8px] uppercase tracking-[0.12em] text-orange-300">Thumbnail</span>}
                          <span title="Drag to reorder" className="grid h-6 w-6 cursor-grab place-items-center rounded-md text-zinc-600 transition group-hover:bg-white/[0.05] group-hover:text-zinc-300 active:cursor-grabbing"><GripVertical size={13}/></span>
                        </div>
                      </div>
                      <button type="button" onClick={() => setSelectedId(option.id)} className="block w-full bg-black/20"><img src={option.image} alt={option.title} className={isStoryLibrary ? 'mx-auto aspect-[9/16] max-h-72 w-auto max-w-full object-cover' : 'aspect-[16/8] w-full object-cover'}/></button>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 px-1 text-[10px] text-zinc-700">Tip: drag any option card to change its order. Numbered option titles update automatically.</p>
            </section>
          </div>

          <aside className="rounded-[26px] border border-white/10 bg-[#111] p-5 sm:p-6">
            {editingBox ? <form onSubmit={saveBox} className="space-y-4"><div className="flex items-center justify-between"><div><p className="text-xs uppercase tracking-[0.18em] text-orange-300">Edit Idea Box</p><h2 className="mt-1 text-xl font-semibold">{libraries.find((library) => library.id === boxLibraryId)?.name || 'Library'}</h2></div><button type="button" onClick={() => setEditingBox(false)} className="grid h-9 w-9 place-items-center rounded-full border border-white/10"><X size={15}/></button></div><label><span className="mb-2 block text-[10px] uppercase tracking-[0.16em] text-zinc-600">Title</span><input value={boxTitle} onChange={(e) => setBoxTitle(e.target.value)} className="w-full rounded-xl border border-white/10 bg-black/25 px-3.5 py-3 text-sm outline-none"/></label><label><span className="mb-2 block text-[10px] uppercase tracking-[0.16em] text-zinc-600">Library</span><select value={boxLibraryId} onChange={(e) => setBoxLibraryId(e.target.value)} className="w-full rounded-xl border border-white/10 bg-[#151515] px-3.5 py-3 text-sm outline-none">{libraries.filter(library => library.id === refItem.libraryId || (canManage(selectedLibrary) && canManage(library))).map((library) => <option key={library.id} value={library.id}>{library.name}</option>)}</select></label><label><span className="mb-2 block text-[10px] uppercase tracking-[0.16em] text-zinc-600">Source</span><input value={boxSource} onChange={(e) => setBoxSource(e.target.value)} className="w-full rounded-xl border border-white/10 bg-black/25 px-3.5 py-3 text-sm outline-none"/></label><label><span className="mb-2 block text-[10px] uppercase tracking-[0.16em] text-zinc-600">Idea box notes</span><textarea value={boxNotes} onChange={(e) => setBoxNotes(e.target.value)} rows={6} className="w-full resize-y rounded-xl border border-white/10 bg-black/25 px-3.5 py-3 text-sm outline-none"/></label><button type="submit" className="w-full rounded-xl bg-orange-500 px-4 py-3 text-xs font-semibold text-black">Save Idea Box</button></form>
            : addingOption ? <OptionEditor initial={emptyOption} adding videoEnabled={Boolean(selectedLibrary?.optionVideoEnabled)} onCancel={() => setAddingOption(false)} onSave={saveOption}/>
            : editingOption && selectedOption ? <OptionEditor initial={selectedOption} adding={false} videoEnabled={Boolean(selectedLibrary?.optionVideoEnabled)} onCancel={() => setEditingOption(false)} onSave={saveOption}/>
            : selectedOption ? <div>
              <div className="border-b border-white/[0.08] pb-5"><p className="text-xs uppercase tracking-[0.18em] text-orange-300">Idea Box</p><h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{refItem.title}</h1><p className="mt-2 text-xs text-zinc-500">{selectedLibrary?.name || 'Sermon Series'} · {selectedLibrary?.aspectRatio || '16:9'} · {selectedLibrary?.width || 1920}×{selectedLibrary?.height || 1080} · {refItem.source}</p>{refItem.notes && <p className="mt-4 text-sm leading-6 text-zinc-400">{refItem.notes}</p>}</div>
              <div className="py-5"><p className="text-[10px] uppercase tracking-[0.18em] text-orange-300">Selected option</p><div className="mt-1 flex items-center justify-between gap-3"><h2 className="text-xl font-semibold">{selectedOption.title}</h2><div className="flex gap-2"><button disabled={!editable} onClick={() => setEditingOption(true)} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-2 text-xs"><Pencil size={12}/> Edit</button><button disabled={!editable} onClick={deleteOption} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-2 text-xs"><Trash2 size={12}/> Delete</button></div></div><button onClick={setAsThumbnail} disabled={!editable || selectedOption.id === refItem.thumbnailOptionId} className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-xs text-zinc-300 disabled:border-orange-500/20 disabled:bg-orange-500/[0.06] disabled:text-orange-300">{selectedOption.id === refItem.thumbnailOptionId && <Check size={13}/>} {selectedOption.id === refItem.thumbnailOptionId ? 'Current thumbnail' : 'Set as thumbnail'}</button></div>
              {selectedLibrary?.optionVideoEnabled && <div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.025] p-4"><p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">Video version</p><p className="mt-2 break-all text-xs leading-5 text-zinc-300">{selectedOption.videoUrl || 'No video URL saved yet.'}</p>{selectedOption.videoUrl && <a href={selectedOption.videoUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex rounded-full border border-white/10 px-3 py-2 text-xs text-zinc-300">Open video</a>}</div>}
              <div className="rounded-2xl border border-orange-500/20 bg-orange-500/[0.035] p-4"><div className="mb-3 flex items-center justify-between"><p className="text-[10px] uppercase tracking-[0.18em] text-orange-300">Prompt used</p><button onClick={copyPrompt} disabled={!selectedOption.promptUsed} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1.5 text-[10px] text-zinc-400 disabled:opacity-30"><Copy size={11}/>{copied ? 'Copied' : 'Copy'}</button></div><div className="max-h-[360px] overflow-y-auto whitespace-pre-wrap font-mono text-xs leading-6 text-zinc-300">{selectedOption.promptUsed || 'No prompt saved yet.'}</div></div>
              {selectedOption.notes && <div className="mt-5"><p className="mb-2 text-[10px] uppercase tracking-[0.18em] text-zinc-600">Notes</p><p className="text-sm leading-6 text-zinc-400">{selectedOption.notes}</p></div>}
              <div className="mt-5"><p className="mb-3 text-[10px] uppercase tracking-[0.18em] text-zinc-600">Color palette</p><div className="flex flex-wrap gap-2">{selectedOption.colorPalette.length ? selectedOption.colorPalette.map((color) => <div key={color} className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 p-1.5 pr-3"><span className="h-9 w-9 rounded-lg border border-white/10" style={{backgroundColor: color}}/><span className="font-mono text-[11px] uppercase text-zinc-300">{color}</span></div>) : <span className="text-xs text-zinc-600">No colors saved yet.</span>}</div></div>
            </div> : null}
          </aside>
        </div>
      </div>
    </main>
  );
}

