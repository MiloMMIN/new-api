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
import { expect, it } from 'vitest'

import { resolveServerAddress } from '../use-server-address'

it('prefers the configured server_address over other shapes', () => {
  expect(
    resolveServerAddress({
      server_address: 'https://api.example.com',
      serverAddress: 'https://other.example.com',
      data: { server_address: 'https://nested.example.com' },
    })
  ).toBe('https://api.example.com')
})

it.each([
  [{ serverAddress: 'https://camel.example.com' }, 'https://camel.example.com'],
  [
    { data: { server_address: 'https://nested.example.com' } },
    'https://nested.example.com',
  ],
  [
    { data: { serverAddress: 'https://nested-camel.example.com' } },
    'https://nested-camel.example.com',
  ],
])('resolves alternative status shape %j', (status, expected) => {
  expect(resolveServerAddress(status)).toBe(expected)
})

it('trims whitespace and strips trailing slashes', () => {
  expect(
    resolveServerAddress({ server_address: '  https://api.example.com///  ' })
  ).toBe('https://api.example.com')
})

it.each([[null], [undefined], [{}], [{ server_address: '' }], [{ server_address: '   ' }]])(
  'falls back to the current origin for %j',
  (status) => {
    expect(resolveServerAddress(status)).toBe(window.location.origin)
  }
)
