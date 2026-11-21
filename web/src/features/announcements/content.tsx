import { useTranslation } from 'react-i18next'
import Markdown from 'react-markdown'

export function AnnouncementContent({ content }: { content: string }) {
  const { t } = useTranslation()
  return (
    <div className='space-y-3 text-sm leading-7 break-words [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_code]:text-xs [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_ul]:list-disc [&_ul]:pl-5'>
      {content.trim() ? (
        <Markdown
          skipHtml
          disallowedElements={['img']}
          components={{
            a: ({ children, href }) =>
              href ? (
                <a href={href} target='_blank' rel='noopener noreferrer'>
                  {children}
                </a>
              ) : (
                <span>{children}</span>
              ),
          }}
        >
          {content}
        </Markdown>
      ) : (
        <p className='text-muted-foreground'>{t('announcements.emptyBody')}</p>
      )}
    </div>
  )
}
