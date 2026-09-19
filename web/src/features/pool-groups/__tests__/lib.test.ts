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
  applyRows,
  buildRows,
  channelGroupModels,
  isManagedName,
  parseGroupMaps,
  poolModelAllowlist,
  serializeMaps,
  unionChannelModels,
  type GroupMaps,
  type GroupRow,
} from '../lib'

const baseMaps: GroupMaps = {
  groupRatio: { default: 1, vip: 0.9, kimi: 1, claude: 1.2 },
  usableGroups: { default: '默认', vip: 'VIP 用户', kimi: 'Kimi 池' },
  topupRatio: { default: 1, vip: 0.9 },
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
      '{"vip":0.9}'
    )
    expect(maps.groupRatio).toEqual({ kimi: 1, claude: 1.2 })
    expect(maps.usableGroups).toEqual({ kimi: 'desc' })
    expect(maps.topupRatio).toEqual({ vip: 0.9 })
  })

  it('falls back to empty maps on invalid JSON', () => {
    const maps = parseGroupMaps('not json', '', '{bad')
    expect(maps).toEqual({ groupRatio: {}, usableGroups: {}, topupRatio: {} })
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
  it('parses group_models from channel setting JSON', () => {
    const setting = JSON.stringify({
      proxy: 'socks5://x',
      group_models: { kimi: ['kimi-k2'], claude: [] },
    })
    expect(channelGroupModels(setting)).toEqual({
      kimi: ['kimi-k2'],
      claude: [],
    })
  })

  it('returns an empty map for missing or malformed settings', () => {
    expect(channelGroupModels(undefined)).toEqual({})
    expect(channelGroupModels(null)).toEqual({})
    expect(channelGroupModels('')).toEqual({})
    expect(channelGroupModels('{bad')).toEqual({})
    expect(channelGroupModels('{"other":1}')).toEqual({})
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

describe('poolModelAllowlist', () => {
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
    expect(poolModelAllowlist(channels, 'kimi')).toEqual(['kimi-k2', 'kimi-k3'])
  })

  it('returns empty when no member restricts the pool', () => {
    expect(poolModelAllowlist(channels, 'deepseek')).toEqual([])
    expect(poolModelAllowlist([{ setting: undefined }], 'kimi')).toEqual([])
  })

  it('only reads the requested pool, leaving other entries untouched', () => {
    expect(poolModelAllowlist(channels, 'claude')).toEqual(['claude-opus'])
  })
})
