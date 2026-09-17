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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { GroupHealthPanel } from '../group-health-panel'

let client: QueryClient

function groupResult(overrides: Record<string, unknown> = {}) {
  return {
    group: 'default',
    avg_ttft_ms: 200,
    avg_latency_ms: 500,
    success_rate: 100,
    avg_tps: 3,
    series: [],
    ...overrides,
  }
}

function mockApis({
  failAll = false,
}: { failAll?: boolean } = {}) {
  vi.spyOn(api, 'get').mockImplementation(async (url, config) => {
    if (failAll) throw new Error('unavailable')
    switch (url) {
      case '/api/user/self/groups':
        return {
          data: {
            success: true,
            data: {
              default: { desc: 'Default group', ratio: 1 },
              vip: { desc: 'VIP group', ratio: 0.55 },
              spare: { desc: 'Spare group', ratio: 2 },
            },
          },
        }
      case '/api/perf-metrics/summary':
        return {
          data: {
            success: true,
            data: {
              models: [{ model_name: 'model-a' }, { model_name: 'model-b' }],
            },
          },
        }
      case '/api/perf-metrics': {
        const model = (config?.params as { model?: string })?.model
        if (model === 'model-a') {
          return {
            data: {
              success: true,
              data: {
                model_name: 'model-a',
                groups: [
                  groupResult({
                    series: [
                      { ts: 1000, success_rate: 100 },
                      { ts: 2000, success_rate: 50 },
                    ],
                  }),
                  groupResult({
                    group: 'vip',
                    success_rate: 60,
                    avg_ttft_ms: 400,
                    avg_latency_ms: 900,
                    series: [{ ts: 1000, success_rate: 60 }],
                  }),
                ],
              },
            },
          }
        }
        if (model === 'model-b') {
          return {
            data: {
              success: true,
              data: {
                model_name: 'model-b',
                groups: [
                  groupResult({
                    success_rate: 80,
                    avg_ttft_ms: 400,
                    avg_latency_ms: 700,
                    series: [{ ts: 1000, success_rate: 80 }],
                  }),
                ],
              },
            },
          }
        }
        return { data: { success: true, data: { groups: [] } } }
      }
      default:
        throw new Error(`Unexpected request: ${url}`)
    }
  })
}

function renderPanel() {
  return render(
    <QueryClientProvider client={client}>
      <GroupHealthPanel />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

afterEach(() => {
  cleanup()
  client.clear()
})

describe('GroupHealthPanel', () => {
  it('shows skeleton placeholders while group metrics are loading', () => {
    vi.spyOn(api, 'get').mockImplementation(() => new Promise(() => {}))
    const { container } = renderPanel()
    expect(
      container.querySelectorAll("[data-slot='skeleton']").length
    ).toBeGreaterThan(0)
    expect(screen.getByText('Group health')).toBeInTheDocument()
  })

  it('merges per-model group metrics into one card per group', async () => {
    mockApis()
    const { container } = renderPanel()

    // "default" is served by two models: (100 + 80) / 2 = 90% success rate.
    const defaultName = await screen.findByText('default')
    const defaultCard = defaultName.closest('div.rounded-xl')
    expect(defaultCard).not.toBeNull()
    expect(defaultCard).toHaveTextContent('(1x)')
    expect(defaultCard).toHaveTextContent('Default group')
    expect(defaultCard).toHaveTextContent('90.00%')
    expect(defaultCard).toHaveTextContent('10.00%')
    expect(defaultCard).toHaveTextContent('Available')
    // Merged series: ts=1000 → (100+80)/2, ts=2000 → 50 → two squares.
    expect(defaultCard?.querySelectorAll('.size-2')).toHaveLength(2)
    expect(container.querySelectorAll("[data-slot='skeleton']").length).toBe(0)
  })

  it('marks critical groups as Down and meta-only groups as No data', async () => {
    mockApis()
    renderPanel()

    const vipName = await screen.findByText('vip')
    const vipCard = vipName.closest('div.rounded-xl')
    expect(vipCard).toHaveTextContent('(0.55x)')
    expect(vipCard).toHaveTextContent('Down')
    expect(vipCard).toHaveTextContent('60.00%')

    const spareName = screen.getByText('spare')
    const spareCard = spareName.closest('div.rounded-xl')
    expect(spareCard).toHaveTextContent('No data')
    expect(spareCard).toHaveTextContent('Spare group')
  })

  it('shows the empty state when no groups and no metrics are available', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (url) => {
      switch (url) {
        case '/api/user/self/groups':
          return { data: { success: true, data: {} } }
        case '/api/perf-metrics/summary':
          return { data: { success: true, data: { models: [] } } }
        default:
          throw new Error(`Unexpected request: ${url}`)
      }
    })
    renderPanel()
    expect(await screen.findByText('No group metrics yet')).toBeInTheDocument()
  })

  it('falls back to the empty state when every metrics request fails', async () => {
    mockApis({ failAll: true })
    renderPanel()
    expect(await screen.findByText('No group metrics yet')).toBeInTheDocument()
  })
})
