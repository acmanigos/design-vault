import type { VideoSource } from '@/lib/video';

export default function VideoPreview({ source, title, poster, story }: { source: VideoSource; title: string; poster?: string; story: boolean }) {
  const className = story
    ? 'mx-auto aspect-[9/16] max-h-[760px] w-full max-w-[428px] bg-black'
    : 'aspect-video w-full bg-black';
  if (source.type === 'youtube' || source.type === 'google-drive') return <iframe
    key={source.embedUrl}
    src={source.embedUrl}
    title={title + (source.type === 'google-drive' ? ' — Google Drive video' : ' video')}
    className={className}
    allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
    allowFullScreen
  />;
  if (source.type === 'direct') return <video key={source.url} controls poster={poster} className={className + ' object-contain'} src={source.url}/>;
  return null;
}
