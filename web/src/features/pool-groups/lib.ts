/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { safeJsonParse } from '@/features/system-settings/utils/json-parser'

/**
 * A group becomes a "user group" by having an entry in TopupGroupRatio —
 * the top-up multiplier only applies to accounts. Everything else in
 * GroupRatio is a "pool group": it selects which channels a token may hit.
 */
export type GroupRow = {
  _id: string
  name: string
  /** billing multiplier applied when a token uses this group */
  ratio: string
  /** top-up multiplier for accounts in this group ('' = not a user group) */
  topupRatio: string
  /** present in UserUsableGroups (tokens may select it) */
  selectable: boolean
  description: string
}

export type GroupKind = 'pool' | 'user'

export type GroupMaps = {
  groupRatio: Record<string, number>
  usableGroups: Record<string, string>
  topupRatio: Record<string, number>
}

let rowIdCounter = 0
function nextRowId() {
  rowIdCounter += 1
  return `grp_${rowIdCounter}`
}

function normalizeRatio(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 1
}

export function parseGroupMaps(
  groupRatio: string,
  usableGroups: string,
  topupRatio: string
): GroupMaps {
  return {
    groupRatio: safeJsonParse<Record<string, number>>(groupRatio, {
      fallback: {},
      silent: true,
    }),
    usableGroups: safeJsonParse<Record<string, string>>(usableGroups, {
      fallback: {},
      silent: true,
    }),
    topupRatio: safeJsonParse<Record<string, number>>(topupRatio, {
      fallback: {},
      silent: true,
    }),
  }
}

function isUserGroupName(maps: GroupMaps, name: string): boolean {
  return Object.hasOwn(maps.topupRatio, name)
}

export function isManagedName(
  maps: GroupMaps,
  kind: GroupKind,
  name: string
): boolean {
  const userGroup = isUserGroupName(maps, name)
  return kind === 'user' ? userGroup : !userGroup
}

/**
 * Rows of one kind derived from the option maps. Pool rows come from
 * GroupRatio names that are not user groups; user rows come from
 * TopupGroupRatio names.
 */
export function buildRows(maps: GroupMaps, kind: GroupKind): GroupRow[] {
  const names =
    kind === 'user'
      ? Object.keys(maps.topupRatio)
      : Object.keys(maps.groupRatio).filter(
          (name) => !isUserGroupName(maps, name)
        )
  return names.map((name) => ({
    _id: nextRowId(),
    name,
    ratio: String(normalizeRatio(maps.groupRatio[name])),
    topupRatio: Object.hasOwn(maps.topupRatio, name)
      ? String(maps.topupRatio[name])
      : '',
    selectable: Object.hasOwn(maps.usableGroups, name),
    description: String(maps.usableGroups[name] ?? ''),
  }))
}

/**
 * Rebuild the managed slice of each option map from rows of one kind,
 * preserving entries owned by the other kind. User rows additionally
 * define the full TopupGroupRatio map.
 */
export function applyRows(
  base: GroupMaps,
  kind: GroupKind,
  rows: GroupRow[]
): GroupMaps {
  const groupRatio: Record<string, number> = {}
  const usableGroups: Record<string, string> = {}
  const topupRatio: Record<string, number> =
    kind === 'user' ? {} : { ...base.topupRatio }

  for (const name of Object.keys(base.groupRatio)) {
    if (!isManagedName(base, kind, name)) {
      groupRatio[name] = normalizeRatio(base.groupRatio[name])
    }
  }
  for (const name of Object.keys(base.usableGroups)) {
    if (!isManagedName(base, kind, name)) {
      usableGroups[name] = base.usableGroups[name]
    }
  }

  for (const row of rows) {
    const name = row.name.trim()
    if (!name) continue
    groupRatio[name] = normalizeRatio(row.ratio)
    if (row.selectable) {
      usableGroups[name] = row.description
    }
    if (kind === 'user') {
      const topup = row.topupRatio.trim()
      topupRatio[name] = topup === '' ? 1 : normalizeRatio(topup)
    }
  }

  return { groupRatio, usableGroups, topupRatio }
}

export function serializeMaps(maps: GroupMaps) {
  return {
    GroupRatio: JSON.stringify(maps.groupRatio, null, 2),
    UserUsableGroups: JSON.stringify(maps.usableGroups, null, 2),
    TopupGroupRatio: JSON.stringify(maps.topupRatio, null, 2),
  }
}

export function createRow(prefix: string, existing: string[]): GroupRow {
  let index = 1
  let name = `${prefix}_${index}`
  while (existing.includes(name)) {
    index += 1
    name = `${prefix}_${index}`
  }
  return {
    _id: nextRowId(),
    name,
    ratio: '1',
    topupRatio: '1',
    selectable: true,
    description: '',
  }
}

/** Parsed view of channel.setting relevant to pool membership. */
export function channelGroupModels(
  setting: string | null | undefined
): Record<string, string[]> {
  if (!setting) return {}
  const parsed = safeJsonParse<{ group_models?: Record<string, string[]> }>(
    setting,
    { fallback: {}, silent: true }
  )
  return parsed.group_models ?? {}
}

/** Distinct union of the models declared by the given channels, sorted. */
export function unionChannelModels(modelsCsv: string[]): string[] {
  const set = new Set<string>()
  for (const csv of modelsCsv) {
    for (const model of csv.split(',')) {
      const trimmed = model.trim()
      if (trimmed) set.add(trimmed)
    }
  }
  return [...set].sort()
}

/**
 * The explicit model allowlist a pool currently stores on its member
 * channels: union of every member's group_models entry for it. An empty
 * result means the pool is unrestricted — each member serves all of its
 * declared models. The stored state is shown as-is; members with divergent
 * entries are normalized the next time the pool's model list is saved.
 */
export function poolModelAllowlist(
  channels: { setting?: string | null }[],
  pool: string
): string[] {
  const set = new Set<string>()
  for (const channel of channels) {
    const allowlist = channelGroupModels(channel.setting)[pool]
    if (!allowlist) continue
    for (const model of allowlist) {
      const trimmed = model.trim()
      if (trimmed) set.add(trimmed)
    }
  }
  return [...set].sort()
}
