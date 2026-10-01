import { supabase } from './supabase';
export type Member = { user_id: string; email: string; role: 'editor' | 'viewer' };
export async function members(libraryId: string): Promise<Member[]> {
  const { data, error } = await supabase!.rpc('vault_members', { library: libraryId });
  if (error) throw error;
  return data || [];
}
export async function setMember(libraryId: string, email: string, role: string) {
  const { error } = await supabase!.rpc('vault_set_member', { library: libraryId, member_email: email.trim(), member_role: role });
  if (error) throw error;
}
export async function removeMember(libraryId: string, userId: string) {
  const { error } = await supabase!.from('library_members').delete().eq('library_id', libraryId).eq('user_id', userId);
  if (error) throw error;
}
