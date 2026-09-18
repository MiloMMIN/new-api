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

import { PublicAccessPanel } from '../public-access-panel'

let client: QueryClient

function mockApis({
  tunnel = { available: true, state: 'running', token_set: true },
  config = { lan: false, bind: '127.0.0.1:18700', token_set: true, h2c: false },
}: {
  tunnel?: Record<string, unknown>
  config?: Record<string, unknown>
} = {}) {
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    switch (url) {
      case '/api/farmctl/tunnel':
        return { data: tunnel }
      case '/api/farmctl/config':
        return { data: config }
      default:
        throw new Error(`Unexpected request: ${url}`)
    }
  })
}

function renderPanel() {
  return render(
    <QueryClientProvider client={client}>
      <PublicAccessPanel />
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

describe('PublicAccessPanel', () => {
  it('shows skeleton while tunnel status is loading', () => {
    vi.spyOn(api, 'get').mockImplementation(() => new Promise(() => {}))
    const { container } = renderPanel()
    expect(
      container.querySelectorAll("[data-slot='skeleton']").length
    ).toBeGreaterThan(0)
    expect(screen.getByText('Public access')).toBeInTheDocument()
  })

  it('shows running state with stop/restart actions', async () => {
    mockApis()
    renderPanel()
    expect(await screen.findByText('Tunnel running')).toBeInTheDocument()
    expect(screen.getByText('Stop tunnel')).toBeInTheDocument()
    expect(screen.getByText('Restart')).toBeInTheDocument()
  })

  it('shows the public url with a copy button when farm reports one', async () => {
    mockApis({
      tunnel: {
        available: true,
        state: 'running',
        token_set: true,
        public_url: 'https://api.example.com',
      },
    })
    renderPanel()
    const link = await screen.findByRole('link', {
      name: /api\.example\.com/,
    })
    expect(link).toHaveAttribute('href', 'https://api.example.com')
    expect(link).toHaveAttribute('target', '_blank')
    expect(
      screen.getByRole('button', { name: 'Copy URL' })
    ).toBeInTheDocument()
  })

  it('hides the public url row when farm reports none', async () => {
    mockApis({
      tunnel: { available: true, state: 'stopped', token_set: true },
    })
    renderPanel()
    expect(await screen.findByText('Tunnel stopped')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Copy URL' })
    ).not.toBeInTheDocument()
  })

  it('disables start when tunnel is missing and no token is set', async () => {
    mockApis({
      tunnel: { available: true, state: 'missing', token_set: false },
    })
    renderPanel()
    expect(await screen.findByText('Tunnel not created')).toBeInTheDocument()
    const startBtn = screen.getByText('Start tunnel').closest('button')
    expect(startBtn).toBeDisabled()
    expect(
      screen.getByPlaceholderText('Paste Cloudflare Tunnel token')
    ).toBeInTheDocument()
  })

  it('degrades gracefully when docker socket is unavailable', async () => {
    mockApis({
      tunnel: { available: false, state: 'unavailable', token_set: false },
    })
    renderPanel()
    expect(await screen.findByText('Docker unavailable')).toBeInTheDocument()
    expect(
      screen.getByText('Requires Docker deployment')
    ).toBeInTheDocument()
    expect(screen.queryByText('Start tunnel')).not.toBeInTheDocument()
  })

  it('reflects the h2c flag from farm config', async () => {
    mockApis({ config: { lan: false, bind: 'x', token_set: true, h2c: true } })
    renderPanel()
    expect(await screen.findByText('HTTP/2 (h2c)')).toBeInTheDocument()
    const sw = document.querySelector("[data-slot='switch']")
    expect(sw).toHaveAttribute('data-checked')
  })
})
