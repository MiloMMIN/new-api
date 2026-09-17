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
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { AnnouncementsPanel } from '../announcements-panel'

let client: QueryClient

const ANNOUNCEMENTS = [
  {
    id: 1,
    content: 'Maintenance tonight',
    publishDate: '2026-09-17T10:00:00Z',
    type: 'warning',
  },
]

function mockApis() {
  vi.spyOn(api, 'get').mockImplementation(async (url) => {
    if (url === '/api/status') {
      return {
        data: {
          success: true,
          data: {
            announcements_enabled: true,
            announcements: ANNOUNCEMENTS,
          },
        },
      }
    }
    throw new Error(`Unexpected request: ${url}`)
  })
  vi.spyOn(api, 'put').mockImplementation(async (url) => {
    if (url === '/api/option/') return { data: { success: true } }
    throw new Error(`Unexpected request: ${url}`)
  })
}

function renderPanel(editable: boolean) {
  return render(
    <QueryClientProvider client={client}>
      <AnnouncementsPanel editable={editable} />
    </QueryClientProvider>
  )
}

// jsdom lacks the Web Animations API and base-ui ScrollArea calls
// `viewport.getAnimations({subtree:true})` unconditionally from a timer.
// Stub it locally only for this file (a global polyfill would switch other
// popup tests onto the animation-waiting path).
if (typeof Element.prototype.getAnimations !== 'function') {
  Element.prototype.getAnimations = () => []
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
  client.clear()
})

describe('AnnouncementsPanel admin editing', () => {
  it('hides the add button for non-admin viewers', async () => {
    mockApis()
    renderPanel(false)
    expect(await screen.findByText('Maintenance tonight')).toBeInTheDocument()
    expect(screen.queryByText('Add')).not.toBeInTheDocument()
  })

  it('shows an add button for admins and opens the edit dialog', async () => {
    mockApis()
    renderPanel(true)
    const addBtn = await screen.findByText('Add')
    await userEvent.click(addBtn)
    expect(await screen.findByText('Add Announcement')).toBeInTheDocument()
  })

  it('offers edit/delete inside the detail dialog for admins', async () => {
    mockApis()
    renderPanel(true)
    await userEvent.click(await screen.findByText('Maintenance tonight'))
    expect(
      await screen.findByText('Announcement Details')
    ).toBeInTheDocument()
    expect(screen.getByText('Edit')).toBeInTheDocument()
    expect(screen.getByText('Delete')).toBeInTheDocument()
  })

  it('persists edits through console_setting.announcements', async () => {
    mockApis()
    renderPanel(true)
    await userEvent.click(await screen.findByText('Maintenance tonight'))
    await userEvent.click(await screen.findByText('Edit'))
    const textarea = await screen.findByPlaceholderText(
      /Enter announcement content/
    )
    await userEvent.clear(textarea)
    await userEvent.type(textarea, 'Updated notice')
    await userEvent.click(screen.getByText('Update'))
    await waitFor(() => expect(api.put).toHaveBeenCalled())
    const call = vi.mocked(api.put).mock.calls[0]
    expect(call[0]).toBe('/api/option/')
    const body = call[1] as { key: string; value: string }
    expect(body.key).toBe('console_setting.announcements')
    const saved = JSON.parse(body.value)
    expect(saved[0].content).toBe('Updated notice')
    expect(saved[0].id).toBe(1)
  })
})
