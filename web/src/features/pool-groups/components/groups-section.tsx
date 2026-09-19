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
import { useQueryClient } from '@tanstack/react-query'
import { Lock, LockOpen, Plus, Trash2, WandSparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { StaticDataTable } from '@/components/data-table/static/static-data-table'
import { MultiSelect } from '@/components/multi-select'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { updateChannel } from '@/features/channels/api'
import { useUpdateOption } from '@/features/system-settings/hooks/use-update-option'

import { patchChannelModelFilter } from '../api'
import {
  applyPoolUserAccess,
  applyRows,
  buildRows,
  createRow,
  poolModelFilter,
  poolModelFilterPatch,
  poolUserAccess,
  poolVendor,
  serializeMaps,
  unionChannelModels,
  vendorGroups,
  userGroupNames,
  type GroupKind,
  type GroupMaps,
  type GroupRow,
  type PoolModelFilter,
  type PoolUserAccess,
} from '../lib'
import { PoolModelsDialog } from './pool-models-dialog'
import { UserAccessDialog } from './user-access-dialog'

const sectionCardClassName =
  'relative shadow-sm ring-0 before:pointer-events-none before:absolute before:inset-0 before:rounded-xl before:border before:border-border/90'
const sectionHeaderClassName = 'border-b bg-muted/20'

export type ChannelRef = {
  id: number
  name: string
  group: string
  /** comma-separated models the channel declares */
  models: string
  /** raw channel.setting JSON; group_models inside carries pool allowlists */
  setting?: string | null
  priority?: number
}

type GroupsSectionProps = {
  kind: GroupKind
  maps: GroupMaps
  channels: ChannelRef[]
}

function channelGroups(channel: ChannelRef): string[] {
  return (channel.group || '')
    .split(',')
    .map((g) => g.trim())
    .filter(Boolean)
}

function channelsForPool(channels: ChannelRef[], pool: string) {
  if (!pool) return []
  return channels.filter((channel) => channelGroups(channel).includes(pool))
}

const LOCKED_POOLS_KEY = 'pool_groups_locked'

// Locked pools survive reloads so a deliberate lock stays effective until
// the admin unlocks it — the lock is a guard against bulk vendor matching,
// not a transient dialog state.
function readLockedPools(): Set<string> {
  try {
    const raw = localStorage.getItem(LOCKED_POOLS_KEY)
    if (!raw) return new Set()
    const list: unknown = JSON.parse(raw)
    return new Set(
      Array.isArray(list)
        ? list.filter((v): v is string => typeof v === 'string')
        : []
    )
  } catch {
    return new Set()
  }
}

function writeLockedPools(locked: Set<string>) {
  try {
    localStorage.setItem(LOCKED_POOLS_KEY, JSON.stringify([...locked]))
  } catch {
    /* ignore */
  }
}

export function GroupsSection(props: GroupsSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const queryClient = useQueryClient()
  const [rows, setRows] = useState<GroupRow[]>(() =>
    buildRows(props.maps, props.kind)
  )
  const [deleteTarget, setDeleteTarget] = useState<GroupRow | null>(null)
  const [accessTarget, setAccessTarget] = useState<GroupRow | null>(null)
  const [modelsTarget, setModelsTarget] = useState<GroupRow | null>(null)
  const [channelsSaving, setChannelsSaving] = useState(false)
  const [modelsSaving, setModelsSaving] = useState(false)
  const [accessSaving, setAccessSaving] = useState(false)
  const [bulkMatching, setBulkMatching] = useState(false)
  // Locked pools are skipped by the bulk vendor-match action; the set
  // persists in localStorage so a lock stays until explicitly unlocked.
  const [lockedPools, setLockedPools] = useState<Set<string>>(readLockedPools)
  // Descriptions live inside UserUsableGroups, so unchecking "selectable"
  // would otherwise drop the saved text. Cache it per name so toggling back
  // restores it.
  const descCache = useRef<Record<string, string>>({})

  // Rebuild rows when the underlying option maps change (e.g. after a save
  // round-trip or an external edit). Text inputs commit on blur, so a refetch
  // while typing is not expected.
  useEffect(() => {
    for (const [name, desc] of Object.entries(props.maps.usableGroups)) {
      descCache.current[name] = desc
    }
    setRows(
      buildRows(props.maps, props.kind).map((row) =>
        !row.selectable && row.name in descCache.current
          ? { ...row, description: descCache.current[row.name] }
          : row
      )
    )
  }, [props.maps, props.kind])

  const isPool = props.kind === 'pool'
  const title = isPool ? t('Pool Groups') : t('User Groups')
  const description = isPool
    ? t(
        'Pools are tags attached to channels. A token bound to a pool can only reach channels carrying that pool; channel priority decides the order. Pool ratio multiplies the billed price.'
      )
    : t(
        'User groups are assigned to accounts. The top-up ratio discounts the recharge price for users in the group.'
      )

  const commitRows = (nextRows: GroupRow[]) => {
    setRows(nextRows)
    const next = serializeMaps(applyRows(props.maps, props.kind, nextRows))
    const base = serializeMaps(props.maps)
    const jobs: Promise<unknown>[] = []
    if (next.GroupRatio !== base.GroupRatio) {
      jobs.push(
        updateOption.mutateAsync({ key: 'GroupRatio', value: next.GroupRatio })
      )
    }
    if (next.UserUsableGroups !== base.UserUsableGroups) {
      jobs.push(
        updateOption.mutateAsync({
          key: 'UserUsableGroups',
          value: next.UserUsableGroups,
        })
      )
    }
    if (
      props.kind === 'user' &&
      next.TopupGroupRatio !== base.TopupGroupRatio
    ) {
      jobs.push(
        updateOption.mutateAsync({
          key: 'TopupGroupRatio',
          value: next.TopupGroupRatio,
        })
      )
    }
    void Promise.all(jobs)
  }

  const updateRow = (
    id: string,
    field: Exclude<keyof GroupRow, '_id'>,
    value: string | boolean,
    commit = true
  ) => {
    const next = rows.map((row) =>
      row._id === id ? { ...row, [field]: value } : row
    )
    if (commit) {
      commitRows(next)
    } else {
      setRows(next)
    }
  }

  const addRow = () => {
    commitRows([
      ...rows,
      createRow(
        isPool ? 'pool' : 'user',
        rows.map((row) => row.name)
      ),
    ])
  }

  const removeRow = (row: GroupRow) => {
    commitRows(rows.filter((item) => item._id !== row._id))
  }

  // Toggle channel membership for a pool: `selectedIds` are the channels that
  // should carry this pool tag afterwards. Each changed channel gets a
  // partial {id, group} patch; the backend rebuilds routing abilities.
  const updatePoolChannels = async (
    poolName: string,
    selectedIds: string[]
  ) => {
    const pool = poolName.trim()
    if (!pool) return
    const wanted = new Set(selectedIds.map(Number))
    const changed = props.channels.filter(
      (channel) =>
        channelGroups(channel).includes(pool) !== wanted.has(channel.id)
    )
    if (changed.length === 0) return

    setChannelsSaving(true)
    const failures: string[] = []
    try {
      await Promise.all(
        changed.map(async (channel) => {
          const groups = channelGroups(channel)
          const next = wanted.has(channel.id)
            ? [...groups, pool]
            : groups.filter((g) => g !== pool)
          // Empty group falls back to 'default' like the channel form does —
          // and the backend patch skips zero values, so '' would never persist.
          try {
            const res = await updateChannel(channel.id, {
              group: next.join(',') || 'default',
            })
            if (!res.success) failures.push(channel.name)
          } catch {
            failures.push(channel.name)
          }
        })
      )
    } finally {
      setChannelsSaving(false)
      await queryClient.invalidateQueries({ queryKey: ['channels'] })
    }
    if (failures.length > 0) {
      toast.error(
        t('Failed to update channels: {{names}}', {
          names: failures.join(', '),
        })
      )
    }
  }

  const togglePoolLock = (poolName: string) => {
    const name = poolName.trim()
    if (!name) return
    setLockedPools((current) => {
      const next = new Set(current)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      writeLockedPools(next)
      return next
    })
  }

  // Write a per-pool model filter to every channel carrying the pool tag and
  // return the names of channels whose patch failed. The backend intersects
  // the filter with each channel's declared models, so one shared list is
  // safe across heterogeneous members.
  const applyPoolFilterToChannels = async (
    pool: string,
    filter: PoolModelFilter
  ): Promise<string[]> => {
    const { allow, deny } = poolModelFilterPatch(pool, filter)
    const failures: string[] = []
    await Promise.all(
      channelsForPool(props.channels, pool).map(async (channel) => {
        try {
          const res = await patchChannelModelFilter(channel.id, allow, deny)
          if (!res.success) failures.push(channel.name)
        } catch {
          failures.push(channel.name)
        }
      })
    )
    return failures
  }

  // 'all' clears both allow and deny entries and restores unrestricted
  // serving.
  const updatePoolModelFilter = async (
    poolName: string,
    filter: PoolModelFilter
  ) => {
    const pool = poolName.trim()
    if (!pool) return
    if (channelsForPool(props.channels, pool).length === 0) return

    setModelsSaving(true)
    const failures = await applyPoolFilterToChannels(pool, filter)
    setModelsSaving(false)
    setModelsTarget(null)
    await queryClient.invalidateQueries({ queryKey: ['channels'] })
    if (failures.length > 0) {
      toast.error(
        t('Failed to update channels: {{names}}', {
          names: failures.join(', '),
        })
      )
    }
  }

  // Bulk vendor matching: every unlocked pool whose name matches a vendor
  // present in its member channels gets a whitelist of exactly that vendor's
  // models. Pools already holding that whitelist and pools without a vendor
  // match are skipped. Sequential per pool so pools sharing a channel don't
  // race each other's setting patch.
  const matchAllVendors = async () => {
    setBulkMatching(true)
    const failures: string[] = []
    let applied = 0
    try {
      for (const row of rows) {
        const pool = row.name.trim()
        if (!pool || lockedPools.has(pool)) continue
        const attached = channelsForPool(props.channels, pool)
        if (attached.length === 0) continue
        const options = unionChannelModels(
          attached.map((channel) => channel.models)
        )
        const vendor = poolVendor(pool, options)
        if (!vendor) continue
        const target =
          vendorGroups(options).find((group) => group.vendor === vendor)
            ?.models ?? []
        const current = poolModelFilter(attached, pool)
        const same =
          current.mode === 'allow' &&
          current.models.length === target.length &&
          current.models.every((model) => target.includes(model))
        if (same) continue
        const failed = await applyPoolFilterToChannels(pool, {
          mode: 'allow',
          models: target,
        })
        if (failed.length > 0) {
          failures.push(...failed)
        } else {
          applied += 1
        }
      }
    } finally {
      setBulkMatching(false)
      await queryClient.invalidateQueries({ queryKey: ['channels'] })
    }
    if (applied > 0) {
      toast.success(
        t('Applied vendor match to {{count}} pools', { count: applied })
      )
    } else if (failures.length === 0) {
      toast.info(t('No pools needed vendor matching'))
    }
    if (failures.length > 0) {
      toast.error(
        t('Failed to update channels: {{names}}', {
          names: failures.join(', '),
        })
      )
    }
  }

  // Persist per-user-group access for a pool: visibility overrides go to
  // group_ratio_setting.group_special_usable_group, ratio overrides to
  // GroupGroupRatio. Only the keys that actually changed are written.
  const updatePoolUserAccess = async (
    poolName: string,
    access: Record<string, PoolUserAccess>
  ) => {
    const pool = poolName.trim()
    if (!pool) return
    const nextMaps = {
      ...props.maps,
      ...applyPoolUserAccess(props.maps, pool, access),
    }
    const next = serializeMaps(nextMaps)
    const base = serializeMaps(props.maps)

    setAccessSaving(true)
    try {
      const jobs: Promise<unknown>[] = []
      if (next.GroupGroupRatio !== base.GroupGroupRatio) {
        jobs.push(
          updateOption.mutateAsync({
            key: 'GroupGroupRatio',
            value: next.GroupGroupRatio,
          })
        )
      }
      if (next.GroupSpecialUsableGroup !== base.GroupSpecialUsableGroup) {
        jobs.push(
          updateOption.mutateAsync({
            key: 'group_ratio_setting.group_special_usable_group',
            value: next.GroupSpecialUsableGroup,
          })
        )
      }
      await Promise.all(jobs)
      setAccessTarget(null)
    } finally {
      setAccessSaving(false)
    }
  }

  const duplicateNames = (() => {
    const counts = new Map<string, number>()
    for (const row of rows) {
      const name = row.name.trim()
      if (!name) continue
      counts.set(name, (counts.get(name) ?? 0) + 1)
    }
    return [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([name]) => name)
  })()

  return (
    <Card className={sectionCardClassName}>
      <CardHeader className={sectionHeaderClassName}>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <div className='flex gap-2 sm:self-start'>
            {isPool && (
              <Button
                variant='outline'
                size='sm'
                onClick={() => void matchAllVendors()}
                disabled={bulkMatching || modelsSaving}
                title={t('Locked pools are skipped')}
              >
                <WandSparkles className='mr-2 h-4 w-4' />
                {t('Auto-match vendors')}
              </Button>
            )}
            <Button onClick={addRow} size='sm'>
              <Plus className='mr-2 h-4 w-4' />
              {isPool ? t('Add pool') : t('Add user group')}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <StaticDataTable
          data={rows}
          getRowKey={(row) => row._id}
          emptyClassName='text-muted-foreground h-20 text-sm'
          emptyContent={
            isPool
              ? t('No pools yet. Add a pool to get started.')
              : t('No user groups yet.')
          }
          columns={[
            {
              id: 'name',
              header: isPool ? t('Pool name') : t('Group name'),
              className: 'min-w-40',
              cell: (row) => (
                <Input
                  value={row.name}
                  onChange={(event) =>
                    updateRow(row._id, 'name', event.target.value, false)
                  }
                  onBlur={() => commitRows(rows)}
                  aria-invalid={duplicateNames.includes(row.name.trim())}
                />
              ),
            },
            ...(isPool
              ? []
              : [
                  {
                    id: 'topup-ratio',
                    header: t('Top-up ratio'),
                    className: 'w-28',
                    cell: (row: GroupRow) => (
                      <Input
                        type='number'
                        min={0}
                        step={0.1}
                        value={row.topupRatio}
                        onChange={(event) =>
                          updateRow(
                            row._id,
                            'topupRatio',
                            event.target.value,
                            false
                          )
                        }
                        onBlur={() => commitRows(rows)}
                      />
                    ),
                  },
                ]),
            {
              id: 'ratio',
              header: t('Ratio'),
              className: 'w-28',
              cell: (row) => (
                <Input
                  type='number'
                  min={0}
                  step={0.1}
                  value={row.ratio}
                  onChange={(event) =>
                    updateRow(row._id, 'ratio', event.target.value, false)
                  }
                  onBlur={() => commitRows(rows)}
                />
              ),
            },
            {
              id: 'selectable',
              header: t('User selectable'),
              className: 'w-28 text-center',
              cell: (row) => (
                <div className='flex justify-center'>
                  <Checkbox
                    checked={row.selectable}
                    onCheckedChange={(checked) =>
                      updateRow(row._id, 'selectable', checked === true)
                    }
                    aria-label={t('User selectable')}
                  />
                </div>
              ),
            },
            {
              id: 'description',
              header: t('Description'),
              className: 'min-w-48',
              cell: (row) => {
                if (row.selectable) {
                  return (
                    <Input
                      value={row.description}
                      placeholder={t('Group description')}
                      onChange={(event) =>
                        updateRow(
                          row._id,
                          'description',
                          event.target.value,
                          false
                        )
                      }
                      onBlur={() => commitRows(rows)}
                    />
                  )
                }
                if (!row.description) {
                  return (
                    <span className='text-muted-foreground px-3 text-sm'>
                      -
                    </span>
                  )
                }
                return (
                  <Input
                    value={row.description}
                    disabled
                    title={t(
                      'Description is kept and will be used when the group is user selectable again'
                    )}
                  />
                )
              },
            },
            ...(isPool
              ? [
                  {
                    id: 'channels',
                    header: t('Channels'),
                    className: 'min-w-56',
                    cell: (row: GroupRow) => {
                      const pool = row.name.trim()
                      const attached = channelsForPool(props.channels, pool)
                      return (
                        <MultiSelect
                          options={props.channels.map((channel) => ({
                            value: String(channel.id),
                            label: channel.name,
                            hint:
                              channel.priority !== undefined
                                ? t('Priority {{value}}', {
                                    value: channel.priority,
                                  })
                                : undefined,
                          }))}
                          selected={attached.map((channel) =>
                            String(channel.id)
                          )}
                          onChange={(ids) => {
                            void updatePoolChannels(pool, ids)
                          }}
                          placeholder={t('Select channels')}
                          maxVisibleChips={2}
                          disabled={!pool || channelsSaving}
                        />
                      )
                    },
                  },
                  {
                    id: 'models',
                    header: t('Models'),
                    className: 'w-32',
                    cell: (row: GroupRow) => {
                      const pool = row.name.trim()
                      const attached = channelsForPool(props.channels, pool)
                      const filter = poolModelFilter(attached, pool)
                      let label = t('All models')
                      if (filter.mode === 'allow') {
                        label = t('{{count}} allowed', {
                          count: filter.models.length,
                        })
                      } else if (filter.mode === 'deny') {
                        label = t('{{count}} blocked', {
                          count: filter.models.length,
                        })
                      }
                      return (
                        <Button
                          variant='outline'
                          size='sm'
                          disabled={!pool || attached.length === 0}
                          onClick={() => setModelsTarget(row)}
                        >
                          {label}
                        </Button>
                      )
                    },
                  },
                  {
                    id: 'user-access',
                    header: t('User access'),
                    className: 'w-28',
                    cell: (row: GroupRow) => {
                      const pool = row.name.trim()
                      const groups = userGroupNames(props.maps)
                      const enabled = groups.filter(
                        (userGroup) =>
                          poolUserAccess(props.maps, pool, userGroup).enabled
                      ).length
                      return (
                        <Button
                          variant='outline'
                          size='sm'
                          disabled={!pool || groups.length === 0}
                          onClick={() => setAccessTarget(row)}
                        >
                          {enabled}/{groups.length}
                        </Button>
                      )
                    },
                  },
                ]
              : []),
            {
              id: 'actions',
              header: t('Actions'),
              className: 'text-right',
              cellClassName: 'text-right',
              cell: (row) => {
                const locked = isPool && lockedPools.has(row.name.trim())
                return (
                  <div className='flex justify-end gap-1'>
                    {isPool && (
                      <Button
                        variant='ghost'
                        size='sm'
                        onClick={() => togglePoolLock(row.name)}
                        aria-label={locked ? t('Unlock') : t('Lock')}
                        title={
                          locked
                            ? t('Unlock to include in bulk actions')
                            : t('Lock to skip bulk actions')
                        }
                        className={locked ? 'text-primary' : undefined}
                      >
                        {locked ? (
                          <Lock className='h-4 w-4' />
                        ) : (
                          <LockOpen className='h-4 w-4' />
                        )}
                      </Button>
                    )}
                    <Button
                      variant='ghost'
                      size='sm'
                      onClick={() => setDeleteTarget(row)}
                      aria-label={t('Delete')}
                    >
                      <Trash2 className='h-4 w-4' />
                    </Button>
                  </div>
                )
              },
            },
          ]}
        />
        {duplicateNames.length > 0 && (
          <p className='text-destructive mt-3 text-sm'>
            {t('Duplicate group names: {{names}}', {
              names: duplicateNames.join(', '),
            })}
          </p>
        )}
      </CardContent>

      <PoolModelsDialog
        open={modelsTarget !== null}
        onOpenChange={(open) => {
          if (!open) setModelsTarget(null)
        }}
        poolName={modelsTarget?.name ?? ''}
        options={unionChannelModels(
          channelsForPool(props.channels, modelsTarget?.name.trim() ?? '').map(
            (channel) => channel.models
          )
        )}
        filter={poolModelFilter(
          channelsForPool(props.channels, modelsTarget?.name.trim() ?? ''),
          modelsTarget?.name.trim() ?? ''
        )}
        saving={modelsSaving}
        onSave={(filter) => {
          if (modelsTarget) {
            void updatePoolModelFilter(modelsTarget.name, filter)
          }
        }}
      />
      <UserAccessDialog
        open={accessTarget !== null}
        onOpenChange={(open) => {
          if (!open) setAccessTarget(null)
        }}
        poolName={accessTarget?.name ?? ''}
        poolRatio={accessTarget?.ratio ?? '1'}
        userGroups={userGroupNames(props.maps)}
        access={Object.fromEntries(
          userGroupNames(props.maps).map((userGroup) => [
            userGroup,
            poolUserAccess(props.maps, accessTarget?.name ?? '', userGroup),
          ])
        )}
        saving={accessSaving}
        onSave={(access) => {
          if (accessTarget) {
            void updatePoolUserAccess(accessTarget.name, access)
          }
        }}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title={t('Delete group')}
        desc={
          isPool
            ? t(
                'Delete pool "{{name}}"? Channels keep the tag but tokens bound to it will stop working.',
                { name: deleteTarget?.name }
              )
            : t('Delete user group "{{name}}"?', { name: deleteTarget?.name })
        }
        confirmText={t('Delete')}
        destructive
        handleConfirm={() => {
          if (deleteTarget) removeRow(deleteTarget)
          setDeleteTarget(null)
        }}
      />
    </Card>
  )
}
