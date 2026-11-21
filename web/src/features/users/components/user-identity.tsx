import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { type User } from '../data/schema'

export function UserIdentity({ user }: { user: User }) {
  const initials = user.username
    .split(/[.\s_-]+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
  return (
    <div className='flex min-w-0 items-center gap-3'>
      <Avatar
        className='size-9 shrink-0 border border-border/60'
        aria-hidden='true'
      >
        {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt='' />}
        <AvatarFallback className='bg-muted text-xs font-medium text-muted-foreground'>
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className='min-w-0 flex-1'>
        <div className='flex min-w-0 items-center gap-2'>
          <span
            className='max-w-64 truncate text-[13px] leading-5 font-semibold'
            title={user.username}
          >
            {user.username}
          </span>
        </div>
        <span
          className='mt-1 block truncate text-xs text-muted-foreground'
          title={user.email}
        >
          {user.email}
        </span>
      </div>
    </div>
  )
}
