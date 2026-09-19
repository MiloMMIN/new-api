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
import { Activity, RotateCw } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { IconBadge } from '@/components/ui/icon-badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { GroupHealthCard } from '@/features/dashboard/components/overview/group-health-panel'
import {
  fetchGroupHealth,
  GROUP_WINDOW_HOURS,
} from '@/features/performance-metrics/lib/group-health'
import { cn } from '@/lib/utils'

const REFRESH_INTERVAL_MS = 60_000
const SKELETON_IDS = ['skeleton-1', 'skeleton-2', 'skeleton-3']

function GroupMonitorSkeleton() {
  return (
    <div className='space-y-2.5'>
      {SKELETON_IDS.map((id) => (
        <Skeleton key={id} className='h-28 w-full rounded-xl' />
      ))}
    </div>
  )
}

export function GroupMonitorPanel(props: { className?: string }) {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: ['dashboard', 'group-health', GROUP_WINDOW_HOURS],
    queryFn: fetchGroupHealth,
    refetchInterval: REFRESH_INTERVAL_MS,
    retry: false,
  })
  const items = query.data ?? []

  let body: ReactNode
  if (query.isLoading) {
    body = <GroupMonitorSkeleton />
  } else if (items.length === 0) {
    body = (
      <div className='text-muted-foreground rounded-lg border border-dashed p-6 text-center text-xs'>
        {t('No group metrics yet')}
      </div>
    )
  } else {
    body = (
      <div className='space-y-2.5 pr-1 pb-1'>
        {items.map((item) => (
          <GroupHealthCard key={item.name} item={item} />
        ))}
      </div>
    )
  }

  return (
    <aside
      className={cn(
        'flex min-h-0 w-64 shrink-0 flex-col xl:w-72',
        props.className
      )}
    >
      <div className='mb-2 flex shrink-0 items-center justify-between gap-2 px-0.5'>
        <div className='flex min-w-0 items-center gap-1.5'>
          <IconBadge tone='info' size='xs'>
            <Activity />
          </IconBadge>
          <span className='truncate text-sm font-semibold'>
            {t('Pool Monitor')}
          </span>
        </div>
        <div className='flex shrink-0 items-center gap-1'>
          <span className='text-muted-foreground text-xs'>
            {t('{{count}} pools', { count: items.length })}
          </span>
          <Button
            variant='ghost'
            size='sm'
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
            className='size-6 p-0'
          >
            <RotateCw
              className={cn('size-3.5', query.isFetching && 'animate-spin')}
              aria-label={t('Refresh')}
            />
          </Button>
        </div>
      </div>

      <ScrollArea className='min-h-0 flex-1'>{body}</ScrollArea>
    </aside>
  )
}
