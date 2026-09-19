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
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { LoadingState } from '@/components/loading-state'
import { getChannels } from '@/features/channels/api'
import { getSystemOptions } from '@/features/system-settings/api'

import { GroupsSection, type ChannelRef } from './components/groups-section'
import { parseGroupMaps } from './lib'

function optionValue(
  options: { key: string; value: string }[] | undefined,
  key: string,
  fallback: string
): string {
  return options?.find((option) => option.key === key)?.value ?? fallback
}

export function PoolGroups() {
  const { t } = useTranslation()

  const optionsQuery = useQuery({
    queryKey: ['system-options'],
    queryFn: getSystemOptions,
    refetchOnWindowFocus: false,
  })
  const channelsQuery = useQuery({
    queryKey: ['channels', 'pool-groups-page'],
    queryFn: () => getChannels({ p: 1, page_size: 200 }),
    refetchOnWindowFocus: false,
  })

  const maps = useMemo(() => {
    const options = optionsQuery.data?.data
    return parseGroupMaps(
      optionValue(options, 'GroupRatio', '{}'),
      optionValue(options, 'UserUsableGroups', '{}'),
      optionValue(options, 'TopupGroupRatio', '{}')
    )
  }, [optionsQuery.data])

  const channels = useMemo<ChannelRef[]>(() => {
    const items = channelsQuery.data?.data?.items ?? []
    return items.map((item) => ({
      id: item.id,
      name: item.name,
      group: item.group || '',
      models: item.models || '',
      setting: item.setting,
      priority: item.priority ?? undefined,
    }))
  }, [channelsQuery.data])

  if (optionsQuery.isLoading) {
    return <LoadingState />
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Pool Groups')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='space-y-4'>
          <GroupsSection kind='pool' maps={maps} channels={channels} />
          <GroupsSection kind='user' maps={maps} channels={channels} />
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
