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
import { Globe } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { useServerAddress } from '@/hooks/use-server-address'

export function ApiKeysBaseUrl() {
  const { t } = useTranslation()
  const serverAddress = useServerAddress()

  if (!serverAddress) return null

  return (
    <div className='bg-muted/60 flex h-9 min-w-0 items-center gap-2 rounded-lg border px-2.5'>
      <Globe
        className='text-muted-foreground size-3.5 shrink-0'
        aria-hidden='true'
      />
      <span className='text-muted-foreground shrink-0 text-xs'>
        {t('API Base URL')}
      </span>
      <span className='max-w-55 truncate font-mono text-xs sm:max-w-75'>
        {serverAddress}
      </span>
      <CopyButton
        value={serverAddress}
        variant='ghost'
        size='icon'
        className='size-6'
        iconClassName='size-3.5'
        tooltip={t('Copy base URL')}
        aria-label={t('Copy base URL')}
      />
    </div>
  )
}
