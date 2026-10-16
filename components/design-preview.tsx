'use client';

import { useState } from 'react';
import { ArrowLeft, Play } from 'lucide-react';
import VideoPreview from './video-preview';
import type { VideoSource } from '@/lib/video';

export default function DesignPreview({ source, title, image, alt, story }: {
  source: VideoSource; title: string; image?: string; alt: string; story: boolean;
}) {
  const [showVideo, setShowVideo] = useState(false);
  const hasVideo = source.type !== 'none';

  if (showVideo && hasVideo) return <div>
    <div className="border-b border-white/10 p-3">
      <button type="button" onClick={() => setShowVideo(false)} className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400">
        <ArrowLeft size={14}/> Back to image
      </button>
    </div>
    <VideoPreview source={source} title={title} poster={image} story={story}/>
  </div>;

  return <div className="relative">
    {image ? <img src={image} alt={alt} className={story
      ? 'mx-auto block max-h-[760px] w-auto max-w-full object-contain'
      : 'block max-h-[680px] w-full object-contain'}/>
      : <div className={story ? 'mx-auto grid aspect-[9/16] max-w-[428px] place-items-center text-sm text-zinc-500' : 'grid aspect-video place-items-center text-sm text-zinc-500'}>Design image unavailable</div>}
    {hasVideo && <button
      type="button"
      onClick={() => setShowVideo(true)}
      aria-label="Play video"
      title="Play video"
      className="absolute bottom-4 right-4 grid h-11 w-11 place-items-center rounded-lg border border-white/20 bg-black/85 text-white shadow-lg transition hover:bg-orange-500 hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400"
    >
      <Play size={20} fill="currentColor" aria-hidden="true"/>
    </button>}
  </div>;
}
