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
import { useMemo } from 'react'

import type { SystemStatus } from '@/features/auth/types'

import { useStatus } from './use-status'

/**
 * Single resolution point for the server's public base URL (display/copy).
 *
 * Precedence: `ServerAddress` system option (snake/camel, top level or under
 * `data`) -> current browser origin. Whitespace and trailing slashes are
 * normalized so callers can safely concatenate paths.
 *
 * Any UI that shows an API base address should go through this function so a
 * change of the global address is reflected everywhere.
 */
export function resolveServerAddress(
  status: SystemStatus | Record<string, unknown> | null | undefined
): string {
  const s = status as Record<string, unknown> | null | undefined
  const data = s?.data as Record<string, unknown> | undefined
  const candidate =
    s?.server_address ?? s?.serverAddress ?? data?.server_address ??
    data?.serverAddress

  if (typeof candidate === 'string' && candidate.trim() !== '') {
    return candidate.trim().replace(/\/+$/, '')
  }
  if (typeof window !== 'undefined') return window.location.origin
  return ''
}

/** Reactive variant for components; shares the single `/api/status` query. */
export function useServerAddress(): string {
  const { status } = useStatus()
  return useMemo(() => resolveServerAddress(status), [status])
}
