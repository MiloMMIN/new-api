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
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import * as z from 'zod'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

import type { AnnouncementItem } from '../../types'

const announcementSchema = z.object({
  content: z
    .string()
    .min(1, 'Content is required')
    .max(500, 'Content must be less than 500 characters'),
  type: z.enum(['default', 'ongoing', 'success', 'warning', 'error']),
  extra: z
    .string()
    .max(100, 'Extra must be less than 100 characters')
    .optional(),
})

export type AnnouncementFormValues = z.infer<typeof announcementSchema>

const TYPE_OPTIONS = [
  { value: 'default', label: 'Default' },
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'success', label: 'Success' },
  { value: 'warning', label: 'Warning' },
  { value: 'error', label: 'Error' },
]

const FORM_ID = 'overview-announcement-form'

interface AnnouncementEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  announcement: AnnouncementItem | null
  saving?: boolean
  onSubmit: (values: AnnouncementFormValues) => void
}

export function AnnouncementEditDialog(props: AnnouncementEditDialogProps) {
  const { t } = useTranslation()
  const form = useForm<AnnouncementFormValues>({
    resolver: zodResolver(announcementSchema),
    defaultValues: { content: '', type: 'default', extra: '' },
  })

  useEffect(() => {
    if (props.open) {
      form.reset({
        content: props.announcement?.content ?? '',
        type: props.announcement?.type ?? 'default',
        extra: props.announcement?.extra ?? '',
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open, props.announcement])

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={
        props.announcement ? t('Edit Announcement') : t('Add Announcement')
      }
      description={t(
        'Create or update system announcements for the dashboard'
      )}
      contentClassName='sm:max-w-lg'
      contentHeight='auto'
      bodyClassName='space-y-4'
      footer={
        <>
          <Button
            type='button'
            variant='outline'
            onClick={() => props.onOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          <Button type='submit' form={FORM_ID} disabled={props.saving}>
            {props.announcement ? t('Update') : t('Add')}
          </Button>
        </>
      }
    >
      <Form {...form}>
        <form
          id={FORM_ID}
          onSubmit={form.handleSubmit(props.onSubmit)}
          className='space-y-4'
        >
          <FormField
            control={form.control}
            name='content'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Content')}</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder={t(
                      'Enter announcement content (supports Markdown/HTML)'
                    )}
                    rows={4}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='type'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Type')}</FormLabel>
                <Select
                  items={TYPE_OPTIONS.map((o) => ({
                    value: o.value,
                    label: t(o.label),
                  }))}
                  onValueChange={field.onChange}
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={t('Select announcement type')} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectGroup>
                      {TYPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {t(o.label)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='extra'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Extra Notes (Optional)')}</FormLabel>
                <FormControl>
                  <Input placeholder={t('Additional information')} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </form>
      </Form>
    </Dialog>
  )
}
