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
import { Cloud, Globe, Loader2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { IconBadge } from '@/components/ui/icon-badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { api } from '@/lib/api'

type TunnelStatus = {
  available: boolean
  state: 'running' | 'stopped' | 'missing' | 'unavailable' | 'error'
  token_set: boolean
  msg?: string
}

type FarmGatewayConfig = {
  lan: boolean
  bind: string
  token_set: boolean
  h2c: boolean
}

const TUNNEL_QUERY_KEY = ['dashboard', 'farm-tunnel']
const FARM_CONFIG_QUERY_KEY = ['dashboard', 'farm-access']

async function fetchTunnel(): Promise<TunnelStatus | null> {
  const res = await api.get('/api/farmctl/tunnel')
  return res.data as TunnelStatus
}

async function fetchFarmConfig(): Promise<FarmGatewayConfig> {
  const res = await api.get('/api/farmctl/config')
  return res.data as FarmGatewayConfig
}

function stateBadge(state: TunnelStatus['state'], t: (k: string) => string) {
  switch (state) {
    case 'running':
      return (
        <Badge
          variant='outline'
          className='border-success/40 bg-success/10 text-success'
        >
          <Globe data-icon='inline-start' />
          {t('Tunnel running')}
        </Badge>
      )
    case 'stopped':
      return <Badge variant='secondary'>{t('Tunnel stopped')}</Badge>
    case 'missing':
      return <Badge variant='secondary'>{t('Tunnel not created')}</Badge>
    default:
      return <Badge variant='secondary'>{t('Docker unavailable')}</Badge>
  }
}

export function PublicAccessPanel() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [tokenInput, setTokenInput] = useState('')

  const tunnelQuery = useQuery({
    queryKey: TUNNEL_QUERY_KEY,
    queryFn: fetchTunnel,
    staleTime: 15 * 1000,
    retry: false,
  })
  const configQuery = useQuery({
    queryKey: FARM_CONFIG_QUERY_KEY,
    queryFn: fetchFarmConfig,
    staleTime: 30 * 1000,
    retry: false,
  })

  const tunnel = tunnelQuery.data
  const cfg = configQuery.data

  const actionMutation = useMutation({
    mutationFn: async (action: 'start' | 'stop' | 'restart') => {
      const res = await api.post('/api/farmctl/tunnel', {
        action,
        token: tokenInput.trim() || undefined,
      })
      return res.data as { ok: boolean; msg?: string; state?: TunnelStatus['state'] }
    },
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.msg || t('Tunnel operation failed'))
        return
      }
      setTokenInput('')
      queryClient.invalidateQueries({ queryKey: TUNNEL_QUERY_KEY })
      toast.success(t('Tunnel updated'))
    },
    onError: () => toast.error(t('Tunnel operation failed')),
  })

  const saveTokenMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/api/farmctl/tunnel', {
        action: 'save',
        token: tokenInput.trim(),
      })
      return res.data as { ok: boolean; msg?: string }
    },
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.msg || t('Failed to save tunnel token'))
        return
      }
      setTokenInput('')
      queryClient.invalidateQueries({ queryKey: TUNNEL_QUERY_KEY })
      toast.success(t('Tunnel token saved'))
    },
    onError: () => toast.error(t('Failed to save tunnel token')),
  })

  const h2cMutation = useMutation({
    mutationFn: async (h2c: boolean) => {
      const res = await api.post('/api/farmctl/config', { h2c })
      return res.data as { ok: boolean; msg?: string; config?: FarmGatewayConfig }
    },
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.msg || t('Failed to update farm config'))
        return
      }
      if (res.config) {
        queryClient.setQueryData(FARM_CONFIG_QUERY_KEY, res.config)
      }
      toast.success(t('HTTP/2 setting updated'))
    },
    onError: () => toast.error(t('Failed to update farm config')),
  })

  const busy = actionMutation.isPending || saveTokenMutation.isPending
  const canStart =
    tunnel?.available && (tunnel.token_set || tokenInput.trim() !== '')

  let statusText = ''
  if (tunnel) {
    if (!tunnel.available) {
      statusText = t('Requires Docker deployment')
    } else if (tunnel.token_set) {
      statusText = t('Tunnel token set')
    } else {
      statusText = t('Tunnel token not set')
    }
  }

  let body: ReactNode
  if (tunnelQuery.isLoading) {
    body = <Skeleton className='h-14 w-full rounded-xl' />
  } else if (!tunnel) {
    body = (
      <div className='text-muted-foreground py-3 text-center text-xs'>
        {t('Farm manager unreachable')}
      </div>
    )
  } else {
    body = (
      <div className='flex flex-col gap-3'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div className='flex min-w-0 items-center gap-2.5'>
            {stateBadge(tunnel.state, t)}
            <span className='text-muted-foreground truncate text-xs'>
              {statusText}
            </span>
          </div>
          {tunnel.available && (
            <div className='flex items-center gap-2'>
              {tunnel.state === 'running' ? (
                <>
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={busy}
                    onClick={() => actionMutation.mutate('restart')}
                  >
                    {t('Restart')}
                  </Button>
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={busy}
                    onClick={() => actionMutation.mutate('stop')}
                  >
                    {t('Stop tunnel')}
                  </Button>
                </>
              ) : (
                <Button
                  variant='outline'
                  size='sm'
                  disabled={busy || !canStart}
                  onClick={() => actionMutation.mutate('start')}
                >
                  {busy && <Loader2 className='animate-spin' />}
                  {t('Start tunnel')}
                </Button>
              )}
            </div>
          )}
        </div>

        {tunnel.available && (
          <div className='flex items-center gap-2'>
            <Input
              type='password'
              className='h-8 flex-1 text-xs'
              placeholder={
                tunnel.token_set
                  ? t('Tunnel token set — enter to replace')
                  : t('Paste Cloudflare Tunnel token')
              }
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
            />
            <Button
              variant='outline'
              size='sm'
              disabled={busy || tokenInput.trim() === ''}
              onClick={() => saveTokenMutation.mutate()}
            >
              {t('Save token')}
            </Button>
          </div>
        )}

        <div className='flex items-center justify-between gap-3 border-t pt-3'>
          <div className='min-w-0'>
            <div className='text-xs font-medium'>{t('HTTP/2 (h2c)')}</div>
            <div className='text-muted-foreground text-xs'>
              {t('Allow proxies to reuse connections over HTTP/2')}
            </div>
          </div>
          <Switch
            size='sm'
            checked={cfg?.h2c ?? false}
            disabled={!cfg || h2cMutation.isPending}
            onCheckedChange={(v) => h2cMutation.mutate(v === true)}
          />
        </div>
      </div>
    )
  }

  return (
    <section className='bg-card h-full overflow-hidden rounded-2xl border shadow-xs'>
      <div className='flex items-center gap-2 border-b px-4 py-3 sm:px-5'>
        <IconBadge tone='info' size='sm'>
          <Cloud />
        </IconBadge>
        <h3 className='text-sm font-semibold'>{t('Public access')}</h3>
        <span className='text-muted-foreground ml-auto text-xs'>
          {t('Cloudflare Tunnel & HTTP/2 origin')}
        </span>
      </div>

      <div className='p-4 sm:p-5'>{body}</div>
    </section>
  )
}
