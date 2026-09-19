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
import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { BadgeListCell } from '@/components/data-table'
import { StaticDataTable } from '@/components/data-table/static/static-data-table'
import { StatusBadge } from '@/components/status-badge'
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
}

type GroupsSectionProps = {
  kind: GroupKind
  maps: GroupMaps
  channels: ChannelRef[]
}

function channelsForPool(channels: ChannelRef[], pool: string) {
  if (!pool) return []
  return channels.filter((channel) =>
    (channel.group || '')
      .split(',')
      .map((g) => g.trim())
      .includes(pool)
  )
}

export function GroupsSection(props: GroupsSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const [rows, setRows] = useState<GroupRow[]>(() =>
    buildRows(props.maps, props.kind)
  )
  const [deleteTarget, setDeleteTarget] = useState<GroupRow | null>(null)

  // Rebuild rows when the underlying option maps change (e.g. after a save
  // round-trip or an external edit). Text inputs commit on blur, so a refetch
  // while typing is not expected.
  useEffect(() => {
    setRows(buildRows(props.maps, props.kind))
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
    if (props.kind === 'user' && next.TopupGroupRatio !== base.TopupGroupRatio) {
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
              cell: (row) =>
                row.selectable ? (
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
                ) : (
                  <span className='text-muted-foreground px-3 text-sm'>-</span>
                ),
            },
            ...(isPool
              ? [
                  {
                    id: 'channels',
                    header: t('Channels'),
                    className: 'min-w-48',
                    cell: (row: GroupRow) => {
                      const attached = channelsForPool(
                        props.channels,
                        row.name.trim()
                      )
                      if (attached.length === 0) {
                        return (
                          <span className='text-muted-foreground px-3 text-sm'>
                            -
                          </span>
                        )
                      }
                      return (
                        <BadgeListCell
                          items={attached.map((channel) => (
                            <StatusBadge
                              key={channel.id}
                              label={channel.name}
                              autoColor={channel.name}
                              size='sm'
                            />
                          ))}
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
