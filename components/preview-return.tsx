'use client';

import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { ArrowUp } from 'lucide-react';

export default function PreviewReturn({ children, optionTitle }: { children: ReactNode; optionTitle: string }) {
  const preview = useRef<HTMLDivElement>(null);
  const previewId = useId();
  const [away, setAway] = useState(false);

  useEffect(() => {
    let frame = 0;
    const check = () => {
      frame = 0;
      const element = preview.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      // Show the shortcut when too little of the preview remains to inspect it.
      setAway(rect.top < 0 && rect.bottom < Math.min(160, rect.height * 0.4));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(check); };
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    if (preview.current) observer?.observe(preview.current);
    check();
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      observer?.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const returnToImage = () => {
    const element = preview.current;
    if (!element) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.focus({ preventScroll: true });
    element.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  };

  return <>
    <div ref={preview} id={previewId} role="region" aria-label="Selected design preview" tabIndex={-1}
      className="scroll-mt-4 overflow-hidden rounded-[26px] border border-white/10 bg-[#111] focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400">
      {children}
    </div>
    {away && <button type="button" onClick={returnToImage} aria-controls={previewId}
      aria-label={'Back to selected image: ' + optionTitle}
      style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      className="fixed right-4 z-40 flex max-w-[calc(100vw-2rem)] items-center gap-2.5 rounded-2xl border border-orange-300/30 bg-orange-500 px-4 py-3 text-left text-black shadow-xl shadow-black/50 transition hover:bg-orange-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 sm:right-6">
      <ArrowUp size={18} aria-hidden="true"/>
      <span><span className="block text-xs font-semibold">Selected image</span><span className="block max-w-44 truncate text-[10px] opacity-75">{optionTitle}</span></span>
    </button>}
  </>;
}
