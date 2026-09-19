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
import { CheckSquare, Search, Square, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

import {
  poolVendor,
  vendorGroups,
  type PoolModelFilter,
  type PoolModelMode,
} from '../lib'

type PoolModelsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  poolName: string
  /** model universe = union of models declared by the pool's channels */
  options: string[]
  filter: PoolModelFilter
  saving: boolean
  onSave: (filter: PoolModelFilter) => void
}

const MODES: { value: PoolModelMode; labelKey: string; descKey: string }[] = [
  {
    value: 'all',
    labelKey: 'All models',
    descKey: 'Serve every model the member channels declare.',
  },
  {
    value: 'allow',
    labelKey: 'Whitelist',
    descKey: 'Serve only the selected models in this pool.',
  },
  {
    value: 'deny',
    labelKey: 'Blacklist',
    descKey: 'Serve everything except the selected models.',
  },
]

export function PoolModelsDialog(props: PoolModelsDialogProps) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<PoolModelMode>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [manual, setManual] = useState('')

  useEffect(() => {
    if (props.open) {
      setMode(props.filter.mode)
      setSelected(new Set(props.filter.models))
      setSearch('')
      setManual('')
    }
  }, [props.open, props.filter])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    const visible = query
      ? props.options.filter((model) => model.toLowerCase().includes(query))
      : props.options
    // Selected names outside the declared universe (aliases, mapped models)
    // stay visible so they can be unchecked.
    const extras = [...selected].filter(
      (model) =>
        !props.options.includes(model) &&
        (!query || model.toLowerCase().includes(query))
    )
    return [...extras, ...visible]
  }, [props.options, selected, search])

  const toggle = (model: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current)
      if (checked) {
        next.add(model)
      } else {
        next.delete(model)
      }
      return next
    })
  }

  const selectAll = () => {
    setSelected((current) => new Set([...current, ...filtered]))
  }

  const addManual = () => {
    const name = manual.trim()
    if (!name) return
    setSelected((current) => new Set(current).add(name))
    setManual('')
  }

  const vendors = useMemo(() => vendorGroups(props.options), [props.options])

  const matchedVendor = useMemo(
    () => poolVendor(props.poolName, props.options),
    [props.poolName, props.options]
  )

  const toggleVendor = (models: string[]) => {
    setSelected((current) => {
      const next = new Set(current)
      const allSelected = models.every((model) => next.has(model))
      for (const model of models) {
        if (allSelected) {
          next.delete(model)
        } else {
          next.add(model)
        }
      }
      return next
    })
  }

  const filtering = mode !== 'all'

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('Pool models for {{pool}}', { pool: props.poolName })}
      description={t(
        "Applies to every channel carrying this pool. The list is intersected with each channel's declared models, so unlisted entries never leak through."
      )}
      footer={
        <>
          <Button
            variant='outline'
            onClick={() => props.onOpenChange(false)}
            disabled={props.saving}
          >
            {t('Cancel')}
          </Button>
          <Button
            onClick={() => props.onSave({ mode, models: [...selected].sort() })}
            disabled={props.saving}
          >
            {t('Save')}
          </Button>
        </>
      }
    >
      <div className='space-y-4'>
        <RadioGroup
          value={mode}
          onValueChange={(value) => setMode(value as PoolModelMode)}
          className='grid gap-2 sm:grid-cols-3'
        >
          {MODES.map((item) => (
            <div
              key={item.value}
              className='border-input has-checked:border-primary has-checked:bg-primary/5 flex items-start gap-2 rounded-md border p-3'
            >
              <RadioGroupItem
                value={item.value}
                id={`mode-${item.value}`}
                className='mt-0.5'
              />
              <div className='space-y-1'>
                <Label
                  htmlFor={`mode-${item.value}`}
                  className='cursor-pointer font-medium'
                >
                  {t(item.labelKey)}
                </Label>
                <p className='text-muted-foreground text-xs'>
                  {t(item.descKey)}
                </p>
              </div>
            </div>
          ))}
        </RadioGroup>

        {filtering && (
          <div className='space-y-2'>
            <div className='flex gap-2'>
              <div className='relative flex-1'>
                <Search className='text-muted-foreground absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2' />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t('Search models')}
                  className='pl-8'
                />
              </div>
              <Button
                variant='outline'
                size='sm'
                onClick={selectAll}
                className='shrink-0'
              >
                <CheckSquare className='mr-1.5 h-4 w-4' />
                {t('Select all')}
              </Button>
              <Button
                variant='outline'
                size='sm'
                onClick={() => setSelected(new Set())}
                className='shrink-0'
                disabled={selected.size === 0}
              >
                <X className='mr-1.5 h-4 w-4' />
                {t('Clear')}
              </Button>
            </div>

            {vendors.length > 0 && (
              <div className='flex flex-wrap items-center gap-1.5'>
                <span className='text-muted-foreground text-xs'>
                  {t('By vendor')}
                </span>
                {vendors.map((group) => {
                  const picked = group.models.filter((model) =>
                    selected.has(model)
                  ).length
                  const allPicked = picked === group.models.length
                  return (
                    <Button
                      key={group.vendor}
                      variant={allPicked ? 'secondary' : 'outline'}
                      size='sm'
                      className='h-7 px-2 text-xs'
                      onClick={() => toggleVendor(group.models)}
                    >
                      {group.vendor} {picked}/{group.models.length}
                    </Button>
                  )
                })}
                {matchedVendor && (
                  <Button
                    variant='default'
                    size='sm'
                    className='h-7 px-2 text-xs'
                    onClick={() => {
                      const group = vendors.find(
                        (item) => item.vendor === matchedVendor
                      )
                      if (group) setSelected(new Set(group.models))
                    }}
                  >
                    {t('Match {{vendor}}', { vendor: matchedVendor })}
                  </Button>
                )}
              </div>
            )}

            <div className='text-muted-foreground text-xs'>
              {t('{{count}} selected', { count: selected.size })}
            </div>

            <div className='max-h-64 overflow-y-auto rounded-md border'>
              {filtered.length === 0 ? (
                <div className='text-muted-foreground px-3 py-6 text-center text-sm'>
                  <Square className='mr-1.5 inline h-4 w-4' />
                  {t('No models match')}
                </div>
              ) : (
                filtered.map((model) => (
                  <label
                    key={model}
                    className='hover:bg-muted/50 flex cursor-pointer items-center gap-2 border-b px-3 py-1.5 text-sm last:border-0'
                  >
                    <Checkbox
                      checked={selected.has(model)}
                      onCheckedChange={(checked) =>
                        toggle(model, checked === true)
                      }
                    />
                    <span className='truncate'>{model}</span>
                  </label>
                ))
              )}
            </div>

            <div className='flex gap-2'>
              <Input
                value={manual}
                onChange={(event) => setManual(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    addManual()
                  }
                }}
                placeholder={t('Add a model name manually')}
              />
              <Button
                variant='outline'
                size='sm'
                onClick={addManual}
                disabled={!manual.trim()}
                className='shrink-0'
              >
                {t('Add')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  )
}
