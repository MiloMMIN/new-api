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
import { Plus, Trash2 } from 'lucide-react'
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

import {
  applyRows,
  buildRows,
  createRow,
  serializeMaps,
  type GroupKind,
  type GroupMaps,
  type GroupRow,
} from '../lib'

const sectionCardClassName =
  'relative shadow-sm ring-0 before:pointer-events-none before:absolute before:inset-0 before:rounded-xl before:border before:border-border/90'
const sectionHeaderClassName = 'border-b bg-muted/20'

export type ChannelRef = {
  id: number
  name: string
  group: string
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

export function GroupsSection(props: GroupsSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const queryClient = useQueryClient()
  const [rows, setRows] = useState<GroupRow[]>(() =>
    buildRows(props.maps, props.kind)
  )
  const [deleteTarget, setDeleteTarget] = useState<GroupRow | null>(null)
  const [channelsSaving, setChannelsSaving] = useState(false)
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
          <Button onClick={addRow} size='sm' className='sm:self-start'>
            <Plus className='mr-2 h-4 w-4' />
            {isPool ? t('Add pool') : t('Add user group')}
          </Button>
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
                ]
              : []),
            {
              id: 'actions',
              header: t('Actions'),
              className: 'text-right',
              cellClassName: 'text-right',
              cell: (row) => (
                <div className='flex justify-end gap-1'>
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={() => setDeleteTarget(row)}
                    aria-label={t('Delete')}
                  >
                    <Trash2 className='h-4 w-4' />
                  </Button>
                </div>
              ),
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
