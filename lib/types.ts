export type SyncStatus = 'local' | 'pending' | 'syncing' | 'synced' | 'error';
export type LibraryPreset = 'image-landscape' | 'video-story';

export const DEFAULT_LIBRARY_ID = 'sermon-series';
export const DEFAULT_LIBRARY_NAME = 'Sermon Series';

export type VaultLibrary = {
  id: string;
  name: string;
  preset: LibraryPreset;
  aspectRatio: '16:9' | '9:16';
  width: number;
  height: number;
  optionVideoEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastSyncedAt?: string;
  syncStatus: SyncStatus;
};

export type IdeaOption = {
  id: string;
  title: string;
  image: string;
  cloudImageUrl?: string;
  videoUrl?: string;
  promptUsed?: string;
  notes?: string;
  colorPalette: string[];
};

export type IdeaBox = {
  id: string;
  title: string;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
  lastSyncedAt?: string;
  syncStatus: SyncStatus;
  libraryId: string;
  source?: string;
  notes?: string;
  /** Legacy box-level video. New video-first libraries store videoUrl on each option. */
  videoUrl?: string;
  thumbnailOptionId: string;
  options: IdeaOption[];
};

export function libraryPresetDefaults(name = ''): Pick<VaultLibrary, 'preset' | 'aspectRatio' | 'width' | 'height' | 'optionVideoEnabled'> {
  if (/plan\s*your\s*visit|story|reel|short/i.test(name)) {
    return { preset: 'video-story', aspectRatio: '9:16', width: 1080, height: 1920, optionVideoEnabled: true };
  }
  return { preset: 'image-landscape', aspectRatio: '16:9', width: 1920, height: 1080, optionVideoEnabled: false };
}

export function getThumbnailOption(reference: IdeaBox): IdeaOption | undefined {
  return reference.options.find((option) => option.id === reference.thumbnailOptionId) ?? reference.options[0];
}
