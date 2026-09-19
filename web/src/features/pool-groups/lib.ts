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
