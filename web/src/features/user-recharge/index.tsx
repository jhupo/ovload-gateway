import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowUpRight, Wallet } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useIdentitySession } from '@/stores/identity-session'
import { formatUsd } from '@/lib/usd'
import { useWallet } from '@/hooks/use-wallet'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Main } from '@/components/layout/main'
import { RequestErrorToast } from '@/components/request-error-toast'
import { BalanceForm } from './balance-form'
import { PlanList } from './plan-list'

export function UserRecharge() {
  const owner = useIdentitySession((state) => state.session?.id)
  return <UserRechargeContent key={owner ?? 'signed-out'} />
}

function UserRechargeContent() {
  const { t, i18n } = useTranslation()
  const tr = (key: string) => t(`userRecharge.${key}`)
  const wallet = useWallet()
  const [view, setView] = useState('balance')
  return (
    <Main id='content'>
      <div
        data-slot='page-heading'
        className='flex flex-wrap items-center justify-between gap-3'
      >
        <div className='flex flex-wrap items-center gap-3'>
          <h1 className='text-2xl font-semibold'>
            {t('userWorkspace.recharge')}
          </h1>
        </div>
        <Button asChild variant='outline' size='sm'>
          <Link to='/user/subscriptions'>
            {t('userWorkspace.subscriptions')}
            <ArrowUpRight className='size-4' />
          </Link>
        </Button>
      </div>
      <div className='flex items-center gap-4 py-1'>
        <div className='flex size-11 shrink-0 items-center justify-center rounded-md bg-muted'>
          <Wallet className='size-5 text-muted-foreground' aria-hidden='true' />
        </div>
        <div className='min-w-0 space-y-1'>
          <div className='text-xs text-muted-foreground'>{tr('balance')}</div>
          <div
            className='text-2xl font-semibold break-words tabular-nums'
            data-testid='recharge-balance'
          >
            {formatUsd(wallet.data?.available_usd, i18n.language)}
          </div>
          {wallet.isError && (
            <RequestErrorToast
              message={wallet.error.message}
              retry={() => void wallet.refetch()}
            />
          )}
        </div>
      </div>
      <Tabs
        value={view}
        onValueChange={setView}
        className='@container/recharge min-w-0 gap-6'
      >
        <TabsList aria-label={tr('views')} className='max-w-full'>
          <TabsTrigger value='balance'>{tr('balanceRecharge')}</TabsTrigger>
          <TabsTrigger value='plans'>{tr('plans')}</TabsTrigger>
        </TabsList>
        <TabsContent value='balance' className='m-0'>
          <BalanceForm balanceUsd={wallet.data?.available_usd} />
        </TabsContent>
        <TabsContent value='plans' className='m-0'>
          <PlanList />
        </TabsContent>
      </Tabs>
    </Main>
  )
}
