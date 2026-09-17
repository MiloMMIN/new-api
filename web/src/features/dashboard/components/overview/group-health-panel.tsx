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
import { Activity } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { IconBadge } from '@/components/ui/icon-badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  getPerfMetrics,
  getPerfMetricsSummary,
} from '@/features/performance-metrics/api'
import {
  formatLatency,
  formatThroughput,
  formatUptimePct,
  getSuccessRateDotClass,
  getSuccessRateLevel,
  getSuccessRateTextClass,
} from '@/features/performance-metrics/lib/format'
import type { PerformanceGroup } from '@/features/performance-metrics/types'
import { getUserGroups } from '@/lib/api'
import { cn } from '@/lib/utils'

const GROUP_WINDOW_HOURS = 24
// Per-model group data is merged across the top-traffic models; the summary
// endpoint already returns models sorted by request volume.
const MODEL_SAMPLE_LIMIT = 8
const SERIES_SQUARE_LIMIT = 48

type GroupSeriesSquare = {
  ts: number
  successRate: number
}

type GroupHealthItem = {
  name: string
  desc: string
  ratio: number | string | undefined
  successRate: number | null
  ttftMs: number | null
  latencyMs: number | null
  tps: number | null
  series: GroupSeriesSquare[]
}

type GroupBucket = {
  successRates: number[]
  ttfts: number[]
  latencies: number[]
  tpsList: number[]
  byTs: Map<number, { sum: number; count: number }>
}

function newBucket(): GroupBucket {
  return {
    successRates: [],
    ttfts: [],
    latencies: [],
    tpsList: [],
    byTs: new Map(),
  }
}

function meanOrNull(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((total, v) => total + v, 0) / values.length
}

async function fetchGroupHealth(): Promise<GroupHealthItem[]> {
  const [groupsRes, summaryRes] = await Promise.all([
    getUserGroups().catch(() => null),
    getPerfMetricsSummary(GROUP_WINDOW_HOURS).catch(() => null),
  ])
  const meta = groupsRes?.success ? (groupsRes.data ?? {}) : {}
  const models = summaryRes?.success
    ? (summaryRes.data?.models ?? []).slice(0, MODEL_SAMPLE_LIMIT)
    : []

  const detailGroups = await Promise.all(
    models.map((model) =>
      getPerfMetrics(model.model_name, GROUP_WINDOW_HOURS)
        .then((res): PerformanceGroup[] =>
          res.success ? (res.data?.groups ?? []) : []
        )
        .catch((): PerformanceGroup[] => [])
    )
  )

  const buckets = new Map<string, GroupBucket>()
  for (const groups of detailGroups) {
    for (const group of groups) {
      const bucket = buckets.get(group.group) ?? newBucket()
      buckets.set(group.group, bucket)
      if (Number.isFinite(group.success_rate)) {
        bucket.successRates.push(group.success_rate)
      }
      if (Number.isFinite(group.avg_ttft_ms) && group.avg_ttft_ms > 0) {
        bucket.ttfts.push(group.avg_ttft_ms)
      }
      if (Number.isFinite(group.avg_latency_ms) && group.avg_latency_ms > 0) {
        bucket.latencies.push(group.avg_latency_ms)
      }
      if (Number.isFinite(group.avg_tps) && group.avg_tps > 0) {
        bucket.tpsList.push(group.avg_tps)
      }
      for (const point of group.series ?? []) {
        if (!Number.isFinite(point.success_rate)) continue
        const cell = bucket.byTs.get(point.ts) ?? { sum: 0, count: 0 }
        cell.sum += point.success_rate
        cell.count += 1
        bucket.byTs.set(point.ts, cell)
      }
    }
  }

  const names = new Set([...Object.keys(meta), ...buckets.keys()])
  const items = [...names].map((name) => {
    const bucket = buckets.get(name)
    const info = meta[name]
    const series = bucket
      ? [...bucket.byTs.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([ts, cell]) => ({ ts, successRate: cell.sum / cell.count }))
          .slice(-SERIES_SQUARE_LIMIT)
      : []
    return {
      name,
      desc: info?.desc ?? '',
      ratio: info?.ratio,
      successRate: bucket ? meanOrNull(bucket.successRates) : null,
      ttftMs: bucket ? meanOrNull(bucket.ttfts) : null,
      latencyMs: bucket ? meanOrNull(bucket.latencies) : null,
      tps: bucket ? meanOrNull(bucket.tpsList) : null,
      series,
    }
  })
  // Groups with live metrics first (best performing on top), then the rest.
  items.sort((a, b) => (b.successRate ?? -1) - (a.successRate ?? -1))
  return items
}

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

function GroupHealthCard(props: { item: GroupHealthItem }) {
  const { t } = useTranslation()
  const item = props.item

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
        <span className='ml-auto shrink-0'>
          <GroupStatusBadge item={item} />
        </span>
      </div>
      {item.desc && (
        <div className='text-muted-foreground mt-0.5 truncate text-[11px]'>
          {item.desc}
        </div>
      )}

      <div className='mt-2 flex flex-wrap gap-[3px]' aria-hidden='true'>
        {item.series.length > 0 ? (
          item.series.map((point) => (
            <span
              key={point.ts}
              className={cn(
                'size-2 rounded-[2px]',
                getSuccessRateDotClass(point.successRate)
              )}
              title={`${new Date(point.ts * 1000).toLocaleString()} · ${formatUptimePct(point.successRate)}`}
            />
          ))
        ) : (
          <span className='text-muted-foreground text-[11px]'>
            {t('No data')}
          </span>
        )}
      </div>

      <div className='text-muted-foreground mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]'>
        <span>
          {t('Success rate')}{' '}
          <b
            className={cn(
              'font-mono font-semibold tabular-nums',
              item.successRate != null &&
                getSuccessRateTextClass(item.successRate)
            )}
          >
            {item.successRate != null
              ? formatUptimePct(item.successRate)
              : '—'}
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
        <span>
          {t('TTFT')}{' '}
          <b className='font-mono font-semibold tabular-nums'>
            {item.ttftMs != null ? formatLatency(item.ttftMs) : '—'}
          </b>
        </span>
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
      </div>
    </div>
  )
}

function GroupStatusBadge(props: { item: GroupHealthItem }) {
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
