import type { VaultLibrary } from './types';
export function canEdit(library?: VaultLibrary) { return library?.role === 'owner' || library?.role === 'editor'; }
export function canManage(library?: VaultLibrary) { return library?.role === 'owner'; }
