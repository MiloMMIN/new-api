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
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Layers, Settings2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { IconBadge } from '@/components/ui/icon-badge'
import { Skeleton } from '@/components/ui/skeleton'
import { api, getUserGroups } from '@/lib/api'

type GroupItem = {
  name: string
  desc: string
  ratio: number | string | undefined
}

async function fetchGroupItems(): Promise<GroupItem[]> {
  const [namesRes, metaRes] = await Promise.all([
    api.get('/api/group/').catch(() => null),
    getUserGroups().catch(() => null),
  ])
  const meta = metaRes?.success ? (metaRes.data ?? {}) : {}
  const names = new Set<string>([
    ...(namesRes?.data?.success ? (namesRes.data.data ?? []) : []),
    ...Object.keys(meta),
  ])
  return [...names].sort().map((name) => ({
    name,
    desc: meta[name]?.desc ?? '',
    ratio: meta[name]?.ratio,
  }))
}

export function GroupManagePanel() {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: ['dashboard', 'group-manage'],
    queryFn: fetchGroupItems,
    staleTime: 60 * 1000,
    retry: false,
  })
  const items = query.data ?? []

  let body: ReactNode
  if (query.isLoading) {
    body = (
      <div className='grid gap-3 sm:grid-cols-2'>
        {['a', 'b'].map((key) => (
          <Skeleton key={key} className='h-16 w-full rounded-xl' />
        ))}
      </div>
    )
  } else if (items.length === 0) {
    body = (
      <div className='text-muted-foreground py-6 text-center text-xs'>
        {t('No groups configured')}
      </div>
    )
  } else {
    body = (
      <div className='grid gap-3 sm:grid-cols-2'>
        {items.map((item) => (
          <div key={item.name} className='bg-muted/30 rounded-xl border p-3'>
            <div className='flex items-center gap-2'>
              <span className='min-w-0 truncate font-mono text-xs font-semibold'>
                {item.name}
              </span>
              {item.ratio != null && (
                <span className='text-muted-foreground shrink-0 text-[11px] tabular-nums'>
                  ({item.ratio}x)
                </span>
              )}
            </div>
            {item.desc && (
              <div className='text-muted-foreground mt-0.5 truncate text-[11px]'>
                {item.desc}
              </div>
            )}
          </div>
        ))}
      </div>
    )
  }

  return (
    <section className='bg-card h-full overflow-hidden rounded-2xl border shadow-xs'>
      <div className='flex items-center gap-2 border-b px-4 py-3 sm:px-5'>
        <IconBadge tone='info' size='sm'>
          <Layers />
        </IconBadge>
        <h3 className='shrink-0 text-sm font-semibold'>{t('Group management')}</h3>
        <span className='text-muted-foreground hidden min-w-0 truncate text-xs sm:inline'>
          {t('Group ratios and usable groups in billing settings')}
        </span>
        <Button
          variant='outline'
          size='sm'
          className='ml-auto h-7 gap-1.5 px-2 text-xs'
          render={
            <Link
              to='/system-settings/billing/$section'
              params={{ section: 'group-pricing' }}
            />
          }
        >
          <Settings2 data-icon='inline-start' />
          {t('Manage')}
        </Button>
      </div>

      <div className='p-4 sm:p-5'>{body}</div>
    </section>
  )
}
