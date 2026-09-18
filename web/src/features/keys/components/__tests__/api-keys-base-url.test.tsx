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
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { ApiKeysBaseUrl } from '../api-keys-base-url'

const i18n = createInstance()
await i18n.init({
  lng: 'en',
  resources: { en: { translation: {} } },
  initAsync: false,
})
const clients: QueryClient[] = []

function renderBaseUrl() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.push(client)
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <ApiKeysBaseUrl />
      </QueryClientProvider>
    </I18nextProvider>
  )
}

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(api, 'get').mockResolvedValue({ data: { success: true, data: {} } })
})
afterEach(() => {
  cleanup()
  localStorage.clear()
  clients.splice(0).forEach((client) => client.clear())
  vi.restoreAllMocks()
})

it('shows the configured server address with a copy button', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: { server_address: 'https://api.example.com' } },
  })
  renderBaseUrl()
  expect(
    await screen.findByText('https://api.example.com')
  ).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Copy base URL' })
  ).toBeInTheDocument()
})

it('falls back to the current origin when no server address is configured', async () => {
  renderBaseUrl()
  expect(
    await screen.findByText(window.location.origin)
  ).toBeInTheDocument()
})
