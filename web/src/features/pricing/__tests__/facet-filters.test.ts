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
import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import {
  ENDPOINT_TYPES,
  FILTER_ALL,
  QUOTA_TYPES,
  SORT_OPTIONS,
} from '../constants'
import {
  facetFilteredModels,
  type PricingFilters,
} from '../lib/filters'
import type { PricingModel } from '../types'

function makeModel(overrides: Partial<PricingModel>): PricingModel {
  return {
    id: 0,
    model_name: 'm',
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 1,
    enable_groups: ['default'],
    ...overrides,
  }
}

const baseFilters: PricingFilters = {
  search: '',
  vendor: FILTER_ALL,
  group: FILTER_ALL,
  quotaType: QUOTA_TYPES.ALL,
  endpointType: ENDPOINT_TYPES.ALL,
  tag: FILTER_ALL,
  sortBy: SORT_OPTIONS.NAME,
}

const models: PricingModel[] = [
  makeModel({ model_name: 'gpt-5', vendor_name: 'OpenAI', tags: 'openai' }),
  makeModel({
    model_name: 'claude-opus',
    vendor_name: 'Anthropic',
    tags: 'anthropic',
    enable_groups: ['default', 'vip'],
  }),
  makeModel({
    model_name: 'gemini-3',
    vendor_name: 'Google',
    tags: 'google',
    quota_type: 1,
  }),
]

describe('facetFilteredModels', () => {
  test('vendor facet ignores the vendor filter itself but honors other filters', () => {
    const filtered = facetFilteredModels(
      models,
      { ...baseFilters, vendor: 'OpenAI' },
      'vendor'
    )
    // vendor filter removed for this facet: all 3 models remain candidates
    assert.equal(filtered.length, 3)
  })

  test('vendor facet respects an active tag filter so chip counts match results', () => {
    const filtered = facetFilteredModels(
      models,
      { ...baseFilters, tag: 'google' },
      'vendor'
    )
    assert.equal(filtered.length, 1)
    assert.equal(filtered[0].vendor_name, 'Google')
  })

  test('tag facet ignores the tag filter itself but honors vendor filter', () => {
    const filtered = facetFilteredModels(
      models,
      { ...baseFilters, tag: 'openai', vendor: 'Anthropic' },
      'tag'
    )
    assert.equal(filtered.length, 1)
    assert.equal(filtered[0].model_name, 'claude-opus')
  })

  test('group facet counts only models whose enable_groups contain the group', () => {
    const filtered = facetFilteredModels(
      models,
      { ...baseFilters, vendor: 'Anthropic' },
      'group'
    )
    const vipCount = filtered.filter((m) =>
      m.enable_groups.includes('vip')
    ).length
    assert.equal(vipCount, 1)
  })

  test('quotaType facet ignores its own filter and honors endpoint filter', () => {
    const withEndpoint = [
      makeModel({
        model_name: 'a',
        supported_endpoint_types: ['openai'],
      }),
      makeModel({
        model_name: 'b',
        quota_type: 1,
        supported_endpoint_types: ['openai'],
      }),
    ]
    const filtered = facetFilteredModels(
      withEndpoint,
      {
        ...baseFilters,
        quotaType: QUOTA_TYPES.TOKEN,
        endpointType: 'openai',
      },
      'quotaType'
    )
    assert.equal(filtered.length, 2)
  })

  test('search filter still applies inside a facet set', () => {
    const filtered = facetFilteredModels(
      models,
      { ...baseFilters, search: 'gemini', vendor: 'OpenAI' },
      'vendor'
    )
    assert.equal(filtered.length, 1)
    assert.equal(filtered[0].model_name, 'gemini-3')
  })

  test('excluding every facet one by one matches the unfiltered count', () => {
    for (const facet of [
      'vendor',
      'group',
      'quotaType',
      'endpointType',
      'tag',
    ] as const) {
      assert.equal(
        facetFilteredModels(models, baseFilters, facet).length,
        models.length
      )
    }
  })

  test('endpointType facet ignores its own filter', () => {
    const filtered = facetFilteredModels(
      models,
      { ...baseFilters, endpointType: ENDPOINT_TYPES.ALL },
      'endpointType'
    )
    assert.equal(filtered.length, models.length)
  })
})
