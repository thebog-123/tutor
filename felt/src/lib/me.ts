import { rpc } from '../supabase';

/** Add the signed-in person to a group's player list (claimed by them). */
export function addMeAsPlayer(groupId: string, name: string) {
  return rpc<string>('add_me_as_player', { p_group: groupId, p_name: name });
}
