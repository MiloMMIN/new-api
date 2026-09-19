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
import { describe, expect, it } from 'vitest'

import {
  applyPoolUserAccess,
  applyRows,
  buildRows,
  channelGroupModels,
  isManagedName,
  parseGroupMaps,
  poolModelFilter,
  poolModelFilterPatch,
  poolUserAccess,
  serializeMaps,
  unionChannelModels,
  userGroupNames,
  type GroupMaps,
  type GroupRow,
} from '../lib'

const baseMaps: GroupMaps = {
  groupRatio: { default: 1, vip: 0.9, kimi: 1, claude: 1.2 },
  usableGroups: { default: '默认', vip: 'VIP 用户', kimi: 'Kimi 池' },
  topupRatio: { default: 1, vip: 0.9 },
  groupGroupRatio: { vip: { kimi: 0.5 } },
  specialUsable: { svip: { '+:claude': 'svip 专属' } },
}

function makeRow(partial: Partial<GroupRow> & { name: string }): GroupRow {
  return {
    _id: `test_${partial.name}`,
    ratio: '1',
    topupRatio: '',
    selectable: false,
    description: '',
    ...partial,
  }
}

describe('parseGroupMaps', () => {
  it('parses option JSON strings into maps', () => {
    const maps = parseGroupMaps(
      '{"kimi":1,"claude":1.2}',
      '{"kimi":"desc"}',
      '{"vip":0.9}',
      '{"vip":{"kimi":0.5}}',
      '{"svip":{"+:claude":"x"}}'
    )
    expect(maps.groupRatio).toEqual({ kimi: 1, claude: 1.2 })
    expect(maps.usableGroups).toEqual({ kimi: 'desc' })
    expect(maps.topupRatio).toEqual({ vip: 0.9 })
    expect(maps.groupGroupRatio).toEqual({ vip: { kimi: 0.5 } })
    expect(maps.specialUsable).toEqual({ svip: { '+:claude': 'x' } })
  })

  it('falls back to empty maps on invalid JSON', () => {
    const maps = parseGroupMaps('not json', '', '{bad')
    expect(maps).toEqual({
      groupRatio: {},
      usableGroups: {},
      topupRatio: {},
      groupGroupRatio: {},
      specialUsable: {},
    })
  })
})

describe('buildRows', () => {
  it('splits pool groups from user groups by TopupGroupRatio membership', () => {
    const pools = buildRows(baseMaps, 'pool')
    const users = buildRows(baseMaps, 'user')

    expect(pools.map((row) => row.name).sort()).toEqual(['claude', 'kimi'])
    expect(users.map((row) => row.name).sort()).toEqual(['default', 'vip'])
  })

  it('hydrates ratio, selectable and description from the maps', () => {
    const claude = buildRows(baseMaps, 'pool').find(
      (row) => row.name === 'claude'
    )
    expect(claude).toMatchObject({
      ratio: '1.2',
      selectable: false,
      description: '',
    })

    const kimi = buildRows(baseMaps, 'pool').find((row) => row.name === 'kimi')
    expect(kimi).toMatchObject({ selectable: true, description: 'Kimi 池' })
  })

  it('hydrates topupRatio for user rows only', () => {
    const vip = buildRows(baseMaps, 'user').find((row) => row.name === 'vip')
    expect(vip).toMatchObject({ topupRatio: '0.9', ratio: '0.9' })
  })
})

describe('isManagedName', () => {
  it('treats TopupGroupRatio members as user groups, others as pools', () => {
    expect(isManagedName(baseMaps, 'user', 'vip')).toBe(true)
    expect(isManagedName(baseMaps, 'pool', 'vip')).toBe(false)
    expect(isManagedName(baseMaps, 'pool', 'kimi')).toBe(true)
    expect(isManagedName(baseMaps, 'user', 'kimi')).toBe(false)
  })
})

describe('applyRows', () => {
  it('rewrites only the pool slice and preserves user-group entries', () => {
    const rows = [
      makeRow({
        name: 'kimi',
        ratio: '0.5',
        selectable: true,
        description: 'K',
      }),
      makeRow({ name: 'gemini', ratio: '2' }),
    ]
    const next = applyRows(baseMaps, 'pool', rows)

    // claude (a pool row) dropped because it is absent from rows
    expect(next.groupRatio).toEqual({
      default: 1,
      vip: 0.9,
      kimi: 0.5,
      gemini: 2,
    })
    expect(next.usableGroups).toEqual({
      default: '默认',
      vip: 'VIP 用户',
      kimi: 'K',
    })
    // user section untouched
    expect(next.topupRatio).toEqual(baseMaps.topupRatio)
  })

  it('rebuilds TopupGroupRatio entirely from user rows', () => {
    const rows = [
      makeRow({ name: 'default', ratio: '1', topupRatio: '1' }),
      makeRow({ name: 'svip', ratio: '0.8', topupRatio: '0.7' }),
    ]
    const next = applyRows(baseMaps, 'user', rows)

    expect(next.topupRatio).toEqual({ default: 1, svip: 0.7 })
    // vip removed from groupRatio/usableGroups since it is a managed user name
    expect(next.groupRatio).toEqual({
      default: 1,
      kimi: 1,
      claude: 1.2,
      svip: 0.8,
    })
    expect(next.usableGroups).toEqual({ kimi: 'Kimi 池' })
  })

  it('skips blank names and normalizes invalid ratios to 1', () => {
    const next = applyRows(baseMaps, 'pool', [
      makeRow({ name: '  ', ratio: '9' }),
      makeRow({ name: 'ok', ratio: 'abc' }),
    ])
    expect(next.groupRatio).toEqual({
      default: 1,
      vip: 0.9,
      ok: 1,
    })
  })

  it('round-trips rows through applyRows -> buildRows', () => {
    const poolRows = buildRows(baseMaps, 'pool')
    const next = applyRows(baseMaps, 'pool', poolRows)
    expect(
      buildRows(next, 'pool')
        .map((row) => row.name)
        .sort()
    ).toEqual(poolRows.map((row) => row.name).sort())
    expect(next.usableGroups).toEqual(baseMaps.usableGroups)

    const userRows = buildRows(baseMaps, 'user')
    const nextUser = applyRows(baseMaps, 'user', userRows)
    expect(
      buildRows(nextUser, 'user')
        .map((row) => row.name)
        .sort()
    ).toEqual(userRows.map((row) => row.name).sort())
    expect(nextUser.topupRatio).toEqual(baseMaps.topupRatio)
  })
})

describe('serializeMaps', () => {
  it('emits the three option payloads as JSON', () => {
    const out = serializeMaps(baseMaps)
    expect(JSON.parse(out.GroupRatio)).toEqual(baseMaps.groupRatio)
    expect(JSON.parse(out.UserUsableGroups)).toEqual(baseMaps.usableGroups)
    expect(JSON.parse(out.TopupGroupRatio)).toEqual(baseMaps.topupRatio)
  })
})

describe('channelGroupModels', () => {
  it('parses allow and deny maps from channel setting JSON', () => {
    const setting = JSON.stringify({
      proxy: 'socks5://x',
      group_models: { kimi: ['kimi-k2'], claude: [] },
      group_models_deny: { kimi: ['kimi-k1'] },
    })
    expect(channelGroupModels(setting)).toEqual({
      allow: { kimi: ['kimi-k2'], claude: [] },
      deny: { kimi: ['kimi-k1'] },
    })
  })

  it('returns empty maps for missing or malformed settings', () => {
    const empty = { allow: {}, deny: {} }
    expect(channelGroupModels(undefined)).toEqual(empty)
    expect(channelGroupModels(null)).toEqual(empty)
    expect(channelGroupModels('')).toEqual(empty)
    expect(channelGroupModels('{bad')).toEqual(empty)
    expect(channelGroupModels('{"other":1}')).toEqual(empty)
  })
})

describe('unionChannelModels', () => {
  it('merges comma-separated model lists, dedupes and sorts', () => {
    expect(
      unionChannelModels(['kimi-k2, claude-opus', 'claude-opus, gpt-5 ,,'])
    ).toEqual(['claude-opus', 'gpt-5', 'kimi-k2'])
  })

  it('handles empty input', () => {
    expect(unionChannelModels([])).toEqual([])
    expect(unionChannelModels(['', ' , '])).toEqual([])
  })
})

describe('poolModelFilter', () => {
  const channels = [
    {
      setting: JSON.stringify({
        group_models: { kimi: ['kimi-k2'], claude: ['claude-opus'] },
      }),
    },
    {
      setting: JSON.stringify({
        group_models: { kimi: ['kimi-k3'] },
      }),
    },
    { setting: undefined },
  ]

  it('unions the allowlists members store for the pool', () => {
    expect(poolModelFilter(channels, 'kimi')).toEqual({
      mode: 'allow',
      models: ['kimi-k2', 'kimi-k3'],
    })
  })

  it('returns all-mode when no member restricts the pool', () => {
    expect(poolModelFilter(channels, 'deepseek')).toEqual({
      mode: 'all',
      models: [],
    })
    expect(poolModelFilter([{ setting: undefined }], 'kimi')).toEqual({
      mode: 'all',
      models: [],
    })
  })

  it('only reads the requested pool', () => {
    expect(poolModelFilter(channels, 'claude')).toEqual({
      mode: 'allow',
      models: ['claude-opus'],
    })
  })

  it('deny mode wins when members diverge', () => {
    const mixed = [
      {
        setting: JSON.stringify({
          group_models: { kimi: ['kimi-k2'] },
          group_models_deny: { kimi: ['kimi-k9'] },
        }),
      },
      {
        setting: JSON.stringify({
          group_models: { kimi: ['kimi-k3'] },
        }),
      },
    ]
    expect(poolModelFilter(mixed, 'kimi')).toEqual({
      mode: 'deny',
      models: ['kimi-k9'],
    })
  })
})

describe('poolModelFilterPatch', () => {
  it('allow mode sets the allowlist and clears the deny entry', () => {
    expect(
      poolModelFilterPatch('kimi', { mode: 'allow', models: ['a', 'b'] })
    ).toEqual({
      allow: { kimi: ['a', 'b'] },
      deny: { kimi: null },
    })
  })

  it('deny mode sets the denylist and clears the allow entry', () => {
    expect(
      poolModelFilterPatch('kimi', { mode: 'deny', models: ['b'] })
    ).toEqual({
      allow: { kimi: null },
      deny: { kimi: ['b'] },
    })
  })

  it('all mode clears both entries', () => {
    expect(poolModelFilterPatch('kimi', { mode: 'all', models: [] })).toEqual({
      allow: { kimi: null },
      deny: { kimi: null },
    })
  })
})

describe('userGroupNames', () => {
  it('returns TopupGroupRatio keys', () => {
    expect(userGroupNames(baseMaps).sort()).toEqual(['default', 'vip'])
  })
})

describe('poolUserAccess', () => {
  it('inherits the global baseline when no override exists', () => {
    // kimi is in usableGroups → visible to everyone by default
    expect(poolUserAccess(baseMaps, 'kimi', 'vip')).toEqual({
      enabled: true,
      ratio: '0.5',
    })
    // claude is not → hidden by default
    expect(poolUserAccess(baseMaps, 'claude', 'vip')).toEqual({
      enabled: false,
      ratio: '',
    })
  })

  it('applies +: and -: overrides on top of the baseline', () => {
    const maps: GroupMaps = {
      ...baseMaps,
      specialUsable: {
        vip: { '-:kimi': '', '+:claude': 'svip 专属' },
      },
    }
    expect(poolUserAccess(maps, 'kimi', 'vip').enabled).toBe(false)
    expect(poolUserAccess(maps, 'claude', 'vip').enabled).toBe(true)
  })
})

describe('applyPoolUserAccess', () => {
  it('writes -: entries when revoking a baseline-visible pool', () => {
    const next = applyPoolUserAccess(baseMaps, 'kimi', {
      vip: { enabled: false, ratio: '' },
    })
    expect(next.specialUsable.vip['-:kimi']).toBeDefined()
    expect(next.specialUsable.vip['+:kimi']).toBeUndefined()
    // empty ratio clears the override
    expect(next.groupGroupRatio.vip?.kimi).toBeUndefined()
  })

  it('writes +: entries when granting a hidden pool', () => {
    const next = applyPoolUserAccess(baseMaps, 'claude', {
      vip: { enabled: true, ratio: '0.8' },
    })
    expect(next.specialUsable.vip['+:claude']).toBeDefined()
    expect(next.groupGroupRatio.vip.claude).toBe(0.8)
  })

  it('removes overrides that match the baseline', () => {
    const maps: GroupMaps = {
      ...baseMaps,
      specialUsable: { vip: { '-:kimi': '', '+:other': 'x' } },
    }
    const next = applyPoolUserAccess(maps, 'kimi', {
      vip: { enabled: true, ratio: '' },
    })
    // -:kimi removed, unrelated +other preserved
    expect(next.specialUsable.vip['-:kimi']).toBeUndefined()
    expect(next.specialUsable.vip['+:other']).toBe('x')
  })

  it('keeps the ratio override when access is disabled', () => {
    const next = applyPoolUserAccess(baseMaps, 'kimi', {
      vip: { enabled: false, ratio: '0.5' },
    })
    expect(next.groupGroupRatio.vip.kimi).toBe(0.5)
  })

  it('does not touch other pools or user groups', () => {
    const next = applyPoolUserAccess(baseMaps, 'kimi', {
      vip: { enabled: true, ratio: '0.5' },
    })
    expect(next.specialUsable.svip['+:claude']).toBe('svip 专属')
  })
})
