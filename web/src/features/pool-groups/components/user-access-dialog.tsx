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
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'

import type { PoolUserAccess } from '../lib'

type UserAccessDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  poolName: string
  /** pool ratio shown as the placeholder of empty ratio overrides */
  poolRatio: string
  userGroups: string[]
  /** initial per-user-group access, keyed by user group name */
  access: Record<string, PoolUserAccess>
  saving: boolean
  onSave: (access: Record<string, PoolUserAccess>) => void
}

export function UserAccessDialog(props: UserAccessDialogProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<Record<string, PoolUserAccess>>({})

  useEffect(() => {
    if (props.open) {
      setDraft({ ...props.access })
    }
  }, [props.open, props.access])

  const updateDraft = (
    userGroup: string,
    field: keyof PoolUserAccess,
    value: string | boolean
  ) => {
    setDraft((current) => {
      const entry = current[userGroup] ?? { enabled: false, ratio: '' }
      return { ...current, [userGroup]: { ...entry, [field]: value } }
    })
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('User access for {{pool}}', { pool: props.poolName })}
      description={t(
        'User selectable decides the default for every group. Overrides below grant or revoke this pool per user group; a ratio override replaces the pool ratio for that group.'
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
          <Button onClick={() => props.onSave(draft)} disabled={props.saving}>
            {t('Save')}
          </Button>
        </>
      }
    >
      <div className='overflow-hidden rounded-md border'>
        <table className='w-full text-sm'>
          <thead className='bg-muted/40 border-b'>
            <tr>
              <th className='px-3 py-2 text-start font-medium'>
                {t('User group')}
              </th>
              <th className='w-24 px-3 py-2 text-center font-medium'>
                {t('Can use')}
              </th>
              <th className='w-40 px-3 py-2 text-start font-medium'>
                {t('Ratio override')}
              </th>
            </tr>
          </thead>
          <tbody>
            {props.userGroups.map((userGroup) => {
              const entry = draft[userGroup] ?? {
                enabled: false,
                ratio: '',
              }
              return (
                <tr key={userGroup} className='border-b last:border-0'>
                  <td className='px-3 py-2'>{userGroup}</td>
                  <td className='px-3 py-2'>
                    <div className='flex justify-center'>
                      <Checkbox
                        checked={entry.enabled}
                        onCheckedChange={(checked) =>
                          updateDraft(userGroup, 'enabled', checked === true)
                        }
                        aria-label={t('Can use')}
                      />
                    </div>
                  </td>
                  <td className='px-3 py-2'>
                    <Input
                      type='number'
                      min={0}
                      step={0.1}
                      value={entry.ratio}
                      placeholder={props.poolRatio}
                      disabled={!entry.enabled}
                      onChange={(event) =>
                        updateDraft(userGroup, 'ratio', event.target.value)
                      }
                      aria-label={t('Ratio override')}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Dialog>
  )
}
