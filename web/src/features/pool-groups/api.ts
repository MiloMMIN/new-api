import { api } from '@/lib/api'

/**
 * Patches the per-pool model allow/deny lists of one channel. Each patch maps
 * pool (group) names to the models that list holds; `null` removes the entry.
 * Selecting one mode clears the other for the same pool, and `null` on both
 * leaves the pool unrestricted. The backend merges the patches into
 * `channel.setting.group_models` / `group_models_deny`.
 */
export async function patchChannelModelFilter(
  channelId: number,
  allow: Record<string, string[] | null>,
  deny: Record<string, string[] | null>
): Promise<{ success: boolean; message?: string }> {
  const res = await api.put('/api/channel/', {
    id: channelId,
    group_models: allow,
    group_models_deny: deny,
  })
  return res.data
}
