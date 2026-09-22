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
import { Activity, CheckCircle2, Database, Zap } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { IconBadge } from '@/components/ui/icon-badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  formatLatency,
  formatThroughput,
  formatUptimePct,
  getSlotDotClass,
  getSuccessRateLevel,
  getSuccessRateTextClass,
  getTtftSlotClass,
} from '@/features/performance-metrics/lib/format'
import {
  fetchGroupHealth,
  GROUP_WINDOW_HOURS,
  type GroupHealthItem,
} from '@/features/performance-metrics/lib/group-health'
import { cn } from '@/lib/utils'

export function GroupHealthPanel() {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: ['dashboard', 'group-health', GROUP_WINDOW_HOURS],
    queryFn: fetchGroupHealth,
    staleTime: 60 * 1000,
    retry: false,
  })

  const items = query.data ?? []

  let body: ReactNode
  if (query.isLoading) {
    body = (
      <div className='grid gap-3 sm:grid-cols-2'>
        {['a', 'b'].map((key) => (
          <Skeleton key={key} className='h-28 w-full rounded-xl' />
        ))}
      </div>
    )
  } else if (items.length === 0) {
    body = (
      <div className='text-muted-foreground py-6 text-center text-xs'>
        {t('No group metrics yet')}
      </div>
    )
  } else {
    body = (
      <div className='grid gap-3 sm:grid-cols-2'>
        {items.map((item) => (
          <GroupHealthCard key={item.name} item={item} />
        ))}
      </div>
    )
  }

  return (
    <section className='bg-card h-full overflow-hidden rounded-2xl border shadow-xs'>
      <div className='flex items-center gap-2 border-b px-4 py-3 sm:px-5'>
        <IconBadge tone='info' size='sm'>
          <Activity />
        </IconBadge>
        <h3 className='text-sm font-semibold'>{t('Group health')}</h3>
        <span className='text-muted-foreground ml-auto text-xs'>
          {t('Performance metrics for the last 24 hours')}
        </span>
      </div>

      <div className='p-4 sm:p-5'>{body}</div>
    </section>
  )
}

export function GroupHealthCard(props: { item: GroupHealthItem }) {
  const { t } = useTranslation()
  const item = props.item

  const agoLabel = (() => {
    if (item.lastTs == null) return null
    const mins = Math.max(
      1,
      Math.round((Date.now() - item.lastTs * 1000) / 60_000)
    )
    if (mins >= 60) {
      return t('{{count}} hours ago', { count: Math.floor(mins / 60) })
    }
    return t('{{count}} minutes ago', { count: mins })
  })()

  return (
    <div className='bg-muted/30 rounded-xl border p-3'>
      <div className='flex items-center gap-2'>
        <span className='min-w-0 truncate font-mono text-xs font-semibold'>
          {item.name}
        </span>
        {typeof item.ratio === 'number' && (
          <span className='text-muted-foreground shrink-0 text-[11px] tabular-nums'>
            ({item.ratio}x)
          </span>
        )}
        <span className='ml-auto flex shrink-0 items-center gap-1.5'>
          <GroupStatusBadge item={item} />
          {agoLabel && (
            <span className='text-muted-foreground text-[11px] tabular-nums'>
              {agoLabel}
            </span>
          )}
        </span>
      </div>
      {item.desc && (
        <div className='text-muted-foreground mt-0.5 truncate text-[11px]'>
          {item.desc}
        </div>
      )}

      <div className='mt-2.5 grid grid-cols-3 gap-2'>
        <div className='min-w-0'>
          <div className='flex items-center gap-1'>
            <Zap className='size-3.5 shrink-0 text-amber-500' />
            <span className='truncate font-mono text-sm font-semibold tabular-nums'>
              {item.ttftMs != null ? formatLatency(item.ttftMs) : '—'}
            </span>
          </div>
          <div className='text-muted-foreground text-[11px]'>
            {t('First token')}
          </div>
        </div>
        <div className='min-w-0'>
          <div className='flex items-center gap-1'>
            <CheckCircle2 className='size-3.5 shrink-0 text-emerald-500' />
            <span
              className={cn(
                'truncate font-mono text-sm font-semibold tabular-nums',
                item.successRate != null &&
                  getSuccessRateTextClass(item.successRate)
              )}
            >
              {item.successRate != null
                ? formatUptimePct(item.successRate)
                : '—'}
            </span>
          </div>
          <div className='text-muted-foreground text-[11px]'>
            {t('Success rate')}
          </div>
        </div>
        <div className='min-w-0'>
          <div className='flex items-center gap-1'>
            <Database className='size-3.5 shrink-0 text-sky-500' />
            <span className='truncate font-mono text-sm font-semibold tabular-nums'>
              {item.cacheRate != null ? formatUptimePct(item.cacheRate) : '—'}
            </span>
          </div>
          <div className='text-muted-foreground text-[11px]'>{t('Cache')}</div>
        </div>
      </div>

      <div className='text-muted-foreground mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]'>
        <span>
          {t('Average latency')}{' '}
          <b className='font-mono font-semibold tabular-nums'>
            {item.latencyMs != null ? formatLatency(item.latencyMs) : '—'}
          </b>
        </span>
        <span>
          {t('Throughput')}{' '}
          <b className='font-mono font-semibold tabular-nums'>
            {item.tps != null ? formatThroughput(item.tps) : '—'}
          </b>
        </span>
        <span>
          {t('Error rate')}{' '}
          <b className='font-mono font-semibold tabular-nums'>
            {item.successRate != null
              ? formatUptimePct(100 - item.successRate)
              : '—'}
          </b>
        </span>
      </div>

      <div className='text-muted-foreground mt-2.5 text-[11px]'>
        {t('Recent first-token status')}
      </div>
      <div className='mt-1 flex gap-[3px]' aria-hidden='true'>
        {item.slots.map((slot) => (
          <span
            key={slot.ts}
            data-slot='ttft-slot'
            className={cn(
              'h-2.5 min-w-1 flex-1 rounded-[2px]',
              slot.ttftMs != null
                ? getTtftSlotClass(slot.ttftMs)
                : getSlotDotClass(slot.successRate)
            )}
            title={
              slot.successRate != null
                ? `${new Date(slot.ts * 1000).toLocaleString()} · ${formatUptimePct(slot.successRate)}${
                    slot.ttftMs != null
                      ? ` · TTFT ${formatLatency(slot.ttftMs)}`
                      : ''
                  }`
                : `${new Date(slot.ts * 1000).toLocaleString()} · ${t('No data')}`
            }
          />
        ))}
      </div>
    </div>
  )
}

export function GroupStatusBadge(props: { item: GroupHealthItem }) {
  const { t } = useTranslation()
  const rate = props.item.successRate
  if (rate == null) {
    return <Badge variant='secondary'>{t('No data')}</Badge>
  }
  const level = getSuccessRateLevel(rate)
  if (level === 'excellent' || level === 'good') {
    return (
      <Badge
        variant='outline'
        className='border-success/40 bg-success/10 text-success'
      >
        {t('Available')}
      </Badge>
    )
  }
  if (level === 'warning') {
    return <Badge variant='warning'>{t('Degraded')}</Badge>
  }
  return <Badge variant='destructive'>{t('Down')}</Badge>
}
