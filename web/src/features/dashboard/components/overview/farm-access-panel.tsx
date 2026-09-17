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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Globe, Network } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { IconBadge } from '@/components/ui/icon-badge'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'

type FarmGatewayConfig = {
  lan: boolean
  bind: string
  token_set: boolean
}

const FARM_CONFIG_QUERY_KEY = ['dashboard', 'farm-access']

async function fetchFarmConfig(): Promise<FarmGatewayConfig> {
  // farm-manager returns a plain object (not the {success,data} envelope)
  const res = await api.get('/api/farmctl/config')
  return res.data as FarmGatewayConfig
}

export function FarmAccessPanel() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: FARM_CONFIG_QUERY_KEY,
    queryFn: fetchFarmConfig,
    staleTime: 30 * 1000,
    retry: false,
  })
  const cfg = query.data

  const mutation = useMutation({
    mutationFn: async (lan: boolean) => {
      const res = await api.post('/api/farmctl/config', { lan })
      return res.data as {
        ok: boolean
        msg?: string
        config?: FarmGatewayConfig
      }
    },
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.msg || t('Failed to update farm config'))
        return
      }
      if (res.config) {
        queryClient.setQueryData(FARM_CONFIG_QUERY_KEY, res.config)
      }
      toast.success(
        res.config?.lan
          ? t('LAN access enabled')
          : t('Switched back to localhost only')
      )
    },
    onError: () => toast.error(t('Failed to update farm config')),
  })

  let body: ReactNode
  if (query.isLoading) {
    body = <Skeleton className='h-14 w-full rounded-xl' />
  } else if (!cfg) {
    body = (
      <div className='text-muted-foreground py-3 text-center text-xs'>
        {t('Farm manager unreachable')}
      </div>
    )
  } else {
    body = (
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='flex min-w-0 items-center gap-2.5'>
          <Badge
            variant='outline'
            className={
              cfg.lan ? 'border-success/40 bg-success/10 text-success' : undefined
            }
          >
            <Globe data-icon='inline-start' />
            {cfg.lan ? t('LAN open') : t('Localhost only')}
          </Badge>
          <span className='text-muted-foreground truncate text-xs'>
            {t('Listening on {{bind}}', { bind: cfg.bind })}
            {' · '}
            {cfg.token_set ? t('Farm token set') : t('Farm token not set')}
          </span>
        </div>
        <Button
          variant='outline'
          size='sm'
          disabled={mutation.isPending}
          onClick={() => mutation.mutate(!cfg.lan)}
        >
          {cfg.lan ? t('Disable LAN access') : t('Enable LAN access')}
        </Button>
      </div>
    )
  }

  return (
    <section className='bg-card h-full overflow-hidden rounded-2xl border shadow-xs'>
      <div className='flex items-center gap-2 border-b px-4 py-3 sm:px-5'>
        <IconBadge tone='info' size='sm'>
          <Network />
        </IconBadge>
        <h3 className='text-sm font-semibold'>{t('Farm gateway')}</h3>
        <span className='text-muted-foreground ml-auto text-xs'>
          {t('Controls the :18700 listen scope')}
        </span>
      </div>

      <div className='p-4 sm:p-5'>{body}</div>
    </section>
  )
}
