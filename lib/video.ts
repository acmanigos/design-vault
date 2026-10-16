export type VideoSource =
  | { type: 'youtube'; embedUrl: string; videoId: string }
  | { type: 'google-drive'; embedUrl: string; openUrl: string; fileId: string }
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

  const drive = getGoogleDriveVideo(raw);
  if (drive) return drive;

  const videoId = getYouTubeVideoId(raw);
  if (videoId) {
    return {
      type: 'youtube',
      videoId,
      embedUrl: `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`,
    };
  }

  try {
    const url = new URL(raw);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return { type: 'none' };
    // Drive folders, malformed links and non-file pages are not raw video files.
    if (url.hostname.replace(/^www\./, '').toLowerCase() === 'drive.google.com') return { type: 'none' };
    return { type: 'direct', url: url.href };
  } catch {
    return { type: 'none' };
  }
}

export function getGoogleDriveVideo(input?: string): Extract<VideoSource, { type: 'google-drive' }> | null {
  const raw = (input || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return null;
    if (url.hostname.replace(/^www\./, '').toLowerCase() !== 'drive.google.com') return null;
    const match = url.pathname.match(/^\/(?:u\/\d+\/)?file\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]+)(?:\/(?:view|preview|edit))?\/?$/);
    const queryLink = /^\/(?:open|uc|thumbnail)\/?$/.test(url.pathname);
    const fileId = cleanId(match?.[1] || (queryLink ? url.searchParams.get('id') || '' : ''));
    if (!fileId) return null;
    const preview = new URL('https://drive.google.com/file/d/' + fileId + '/preview');
    const open = new URL('https://drive.google.com/file/d/' + fileId + '/view');
    const resourceKey = url.searchParams.get('resourcekey');
    if (resourceKey && /^[A-Za-z0-9_-]+$/.test(resourceKey)) {
      preview.searchParams.set('resourcekey', resourceKey);
      open.searchParams.set('resourcekey', resourceKey);
    }
    return { type: 'google-drive', fileId, embedUrl: preview.href, openUrl: open.href };
  } catch { return null; }
}

// Source is also a citation/text field. Only recognized Drive file links
// automatically become videos there; ordinary source text remains a citation.
export function resolveIdeaVideoSource(optionVideo?: string, boxVideo?: string, source?: string): VideoSource {
  for (const value of [optionVideo, boxVideo]) {
    const resolved = resolveVideoSource(value);
    if (resolved.type !== 'none') return resolved;
  }
  return getGoogleDriveVideo(source) || { type: 'none' };
}

