import { Telescope } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Main } from '@/components/layout/main'

export function ComingSoon() {
  const { t } = useTranslation()
  return (
    <Main fixed className='h-svh'>
      <div className='m-auto flex h-full w-full flex-col items-center justify-center gap-2'>
        <Telescope size={72} />
        <h1 className='text-4xl leading-tight font-bold'>
          {t('coming_soon.title')}
        </h1>
        <p className='text-center text-muted-foreground'>
          {t('coming_soon.desc')}
        </p>
      </div>
    </Main>
  )
}
