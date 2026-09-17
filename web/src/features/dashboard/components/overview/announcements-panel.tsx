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
import { Megaphone, Plus } from 'lucide-react'
import { memo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { IconBadge } from '@/components/ui/icon-badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAnnouncements } from '@/features/dashboard/hooks/use-status-data'
import { getPreviewText } from '@/features/dashboard/lib'
import type { AnnouncementItem } from '@/features/dashboard/types'
import { useUpdateOption } from '@/features/system-settings/hooks/use-update-option'
import { getAnnouncementColorClass } from '@/lib/colors'
import { handleServerError } from '@/lib/handle-server-error'
import { formatDateTimeObject } from '@/lib/time'
import { cn } from '@/lib/utils'

import { PanelWrapper } from '../ui/panel-wrapper'
import { AnnouncementDetailModal } from './announcement-detail-dialog'
import {
  AnnouncementEditDialog,
  type AnnouncementFormValues,
} from './announcement-edit-dialog'

const AnnouncementStatusDot = memo(function AnnouncementStatusDot(props: {
  type?: string
}) {
  return (
    <span
      className={cn(
        'mt-1.5 inline-block size-2 shrink-0 rounded-full',
        getAnnouncementColorClass(props.type)
      )}
    />
  )
})

export function AnnouncementsPanel({ editable = false }: { editable?: boolean }) {
  const { t } = useTranslation()
  const { items: list, loading } = useAnnouncements()
  const updateOption = useUpdateOption()
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)

  const selected =
    selectedIdx != null ? (list[selectedIdx] ?? null) : null

  const saveList = async (items: AnnouncementItem[]) => {
    // 补全 id 后整体写回 console_setting.announcements
    const payload = items.map((item, i) => ({ ...item, id: item.id ?? i + 1 }))
    await updateOption.mutateAsync({
      key: 'console_setting.announcements',
      value: JSON.stringify(payload),
    })
  }

  const handleSubmit = async (values: AnnouncementFormValues) => {
    try {
      if (selectedIdx != null && list[selectedIdx]) {
        const next = list.map((item, i) =>
          i === selectedIdx
            ? {
                ...item,
                ...values,
                publishDate: item.publishDate ?? new Date().toISOString(),
              }
            : item
        )
        await saveList(next)
      } else {
        const id = Math.max(0, ...list.map((item) => item.id ?? 0)) + 1
        await saveList([
          ...list,
          { id, publishDate: new Date().toISOString(), ...values },
        ])
      }
      toast.success(t('Announcements saved successfully'))
      setIsEditOpen(false)
      setIsDetailOpen(false)
      setSelectedIdx(null)
    } catch (error) {
      handleServerError(error, t('Failed to save announcements'))
    }
  }

  const handleDelete = async () => {
    if (selectedIdx == null) return
    try {
      await saveList(list.filter((_, i) => i !== selectedIdx))
      toast.success(t('Announcements saved successfully'))
      setIsDeleteOpen(false)
      setIsDetailOpen(false)
      setSelectedIdx(null)
    } catch (error) {
      handleServerError(error, t('Failed to save announcements'))
    }
  }

  return (
    <PanelWrapper
      title={
        <span className='flex items-center gap-2'>
          <IconBadge tone='warning' size='sm'>
            <Megaphone />
          </IconBadge>
          {t('Announcements')}
        </span>
      }
      description={t('Latest platform updates and notices')}
      loading={loading}
      empty={!list.length}
      emptyMessage={t('No announcements at this time')}
      height='h-72'
      contentClassName='p-0'
      headerActions={
        editable ? (
          <Button
            variant='outline'
            size='sm'
            onClick={() => {
              setSelectedIdx(null)
              setIsEditOpen(true)
            }}
          >
            <Plus data-icon='inline-start' />
            {t('Add')}
          </Button>
        ) : undefined
      }
    >
      <ScrollArea className='h-72'>
        <div>
          {list.map((item: AnnouncementItem, idx: number) => {
            const key = item.id ?? `announcement-${idx}`
            return (
              <button
                key={key}
                type='button'
                onClick={() => {
                  setSelectedIdx(idx)
                  setIsDetailOpen(true)
                }}
                className={cn(
                  'group hover:bg-muted/40 w-full px-3 py-3 text-left transition-colors sm:px-5 sm:py-3.5',
                  idx < list.length - 1 && 'border-border/60 border-b'
                )}
              >
                <div className='flex items-start gap-2.5'>
                  <AnnouncementStatusDot type={item.type} />
                  <div className='flex min-w-0 flex-1 flex-col gap-1'>
                    <p className='line-clamp-1 text-sm font-medium'>
                      {getPreviewText(item.content)}
                    </p>
                    <div className='flex items-center justify-between'>
                      {item.publishDate && (
                        <time className='text-muted-foreground/60 text-xs'>
                          {formatDateTimeObject(new Date(item.publishDate))}
                        </time>
                      )}
                      <span className='text-muted-foreground/40 text-xs opacity-0 transition-opacity group-hover:opacity-100'>
                        {t('Click for details')}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </ScrollArea>

      <AnnouncementDetailModal
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        announcement={selected}
        editable={editable}
        onEdit={() => setIsEditOpen(true)}
        onDelete={() => setIsDeleteOpen(true)}
      />

      {editable && (
        <>
          <AnnouncementEditDialog
            open={isEditOpen}
            onOpenChange={setIsEditOpen}
            announcement={selected}
            saving={updateOption.isPending}
            onSubmit={handleSubmit}
          />
          <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('Are you sure?')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t('This announcement will be removed from the list.')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
                <AlertDialogAction
                  variant='destructive'
                  onClick={handleDelete}
                >
                  {t('Delete')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </PanelWrapper>
  )
}
