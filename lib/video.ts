export type VideoSource =
  | { type: 'youtube'; embedUrl: string; videoId: string }
  | { type: 'direct'; url: string }
  | { type: 'none' };

function cleanId(value: string) {
  const match = value.match(/^[A-Za-z0-9_-]{6,}$/);
  return match ? match[0] : '';
}

export function getYouTubeVideoId(input?: string): string {
  const raw = (input ?? '').trim();
  if (!raw) return '';

  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();

    if (host === 'youtu.be') {
      return cleanId(url.pathname.split('/').filter(Boolean)[0] ?? '');
    }

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      const watchId = url.searchParams.get('v');
      if (watchId) return cleanId(watchId);

      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live') {
        return cleanId(parts[1] ?? '');
      }
    }
  } catch {
    return '';
  }

  return '';
}

export function resolveVideoSource(input?: string): VideoSource {
  const raw = (input ?? '').trim();
  if (!raw) return { type: 'none' };

  const videoId = getYouTubeVideoId(raw);
  if (videoId) {
    return {
      type: 'youtube',
      videoId,
      embedUrl: `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`,
    };
  }

  return { type: 'direct', url: raw };
}

