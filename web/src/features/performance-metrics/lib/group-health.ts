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
import { getUserGroups } from '@/lib/api'

import {
  getPerfMetrics,
  getPerfMetricsSummary,
} from '@/features/performance-metrics/api'
import type { PerformanceGroup } from '@/features/performance-metrics/types'

export const GROUP_WINDOW_HOURS = 24
// Per-model group data is merged across the top-traffic models; the summary
// endpoint already returns models sorted by request volume.
const MODEL_SAMPLE_LIMIT = 8
const HOUR_MS = 3_600_000

/**
 * Fold raw per-model series points into one hour-aligned slot per trailing
 * hour, newest on the right. Hours without any sample become null slots so
 * the uptime strip renders a continuous timeline (gray gaps).
 */
function buildSlots(byTs: Map<number, SlotCell>): GroupStatusSlot[] {
  const byHour = new Map<number, SlotCell>()
  for (const [ts, cell] of byTs) {
    const hour = Math.floor(ts / 3600)
    const agg = byHour.get(hour) ?? {
      sum: 0,
      count: 0,
      ttftSum: 0,
      ttftCount: 0,
    }
    agg.sum += cell.sum
    agg.count += cell.count
    agg.ttftSum += cell.ttftSum
    agg.ttftCount += cell.ttftCount
    byHour.set(hour, agg)
  }
  const nowHour = Math.floor(Date.now() / HOUR_MS)
  const slots: GroupStatusSlot[] = []
  for (let i = GROUP_WINDOW_HOURS - 1; i >= 0; i--) {
    const hour = nowHour - i
    const agg = byHour.get(hour)
    slots.push({
      ts: hour * 3600,
      successRate: agg ? agg.sum / agg.count : null,
      ttftMs: agg && agg.ttftCount > 0 ? agg.ttftSum / agg.ttftCount : null,
    })
  }
  return slots
}

/** One fixed-width hour slot of the trailing window; null = no traffic. */
export type GroupStatusSlot = {
  /** hour-aligned unix seconds */
  ts: number
  successRate: number | null
  ttftMs: number | null
}

export type GroupHealthItem = {
  name: string
  desc: string
  ratio: number | string | undefined
  successRate: number | null
  ttftMs: number | null
  latencyMs: number | null
  tps: number | null
  cacheRate: number | null
  /** newest slot (unix seconds) that has traffic; null when never sampled */
  lastTs: number | null
  slots: GroupStatusSlot[]
}

type SlotCell = {
  sum: number
  count: number
  ttftSum: number
  ttftCount: number
}

type GroupBucket = {
  successRates: number[]
  ttfts: number[]
  latencies: number[]
  tpsList: number[]
  cacheRates: number[]
  byTs: Map<number, SlotCell>
}

function newBucket(): GroupBucket {
  return {
    successRates: [],
    ttfts: [],
    latencies: [],
    tpsList: [],
    cacheRates: [],
    byTs: new Map(),
  }
}

function meanOrNull(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((total, v) => total + v, 0) / values.length
}

export async function fetchGroupHealth(): Promise<GroupHealthItem[]> {
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
      if (Number.isFinite(group.cache_hit_rate)) {
        bucket.cacheRates.push(group.cache_hit_rate)
      }
      for (const point of group.series ?? []) {
        if (!Number.isFinite(point.success_rate)) continue
        const cell = bucket.byTs.get(point.ts) ?? {
          sum: 0,
          count: 0,
          ttftSum: 0,
          ttftCount: 0,
        }
        cell.sum += point.success_rate
        cell.count += 1
        if (Number.isFinite(point.avg_ttft_ms) && point.avg_ttft_ms > 0) {
          cell.ttftSum += point.avg_ttft_ms
          cell.ttftCount += 1
        }
        bucket.byTs.set(point.ts, cell)
      }
    }
  }

  const names = new Set([...Object.keys(meta), ...buckets.keys()])
  const items = [...names]
    // Pools only: entries flagged as user (topup) groups are account
    // pricing tiers, not channel pools.
    .filter((name) => meta[name]?.user_group !== true)
    .map((name) => {
      const bucket = buckets.get(name)
      const info = meta[name]
      const slots = buildSlots(bucket?.byTs ?? new Map())
      const lastTs = slots.reduce(
        (latest, slot) =>
          slot.successRate !== null && slot.ts > latest ? slot.ts : latest,
        0
      )
      return {
        name,
        desc: info?.desc ?? '',
        ratio: info?.ratio,
        successRate: bucket ? meanOrNull(bucket.successRates) : null,
        ttftMs: bucket ? meanOrNull(bucket.ttfts) : null,
        latencyMs: bucket ? meanOrNull(bucket.latencies) : null,
        tps: bucket ? meanOrNull(bucket.tpsList) : null,
        cacheRate: bucket ? meanOrNull(bucket.cacheRates) : null,
        lastTs: lastTs > 0 ? lastTs : null,
        slots,
      }
    })
  // Groups with live metrics first (best performing on top), then the rest.
  items.sort((a, b) => (b.successRate ?? -1) - (a.successRate ?? -1))
  return items
}
