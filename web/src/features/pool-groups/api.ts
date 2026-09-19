import { api } from '@/lib/api'

/**
 * Patches the per-pool model allowlist of one channel. `patch` maps pool
 * (group) names to the models the channel serves for it; `null` removes the
 * allowlist so the channel serves all of its models for that pool. The
 * backend merges the patch into `channel.setting.group_models`.
 */
export async function patchChannelGroupModels(
  channelId: number,
  patch: Record<string, string[] | null>
): Promise<{ success: boolean; message?: string }> {
  const res = await api.put('/api/channel/', {
    id: channelId,
    group_models: patch,
  })
  return res.data
}
