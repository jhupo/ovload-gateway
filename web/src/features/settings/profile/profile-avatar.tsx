import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

export function ProfileAvatar({
  username,
  avatar,
  className,
}: {
  username: string
  avatar: string | null
  className?: string
}) {
  return (
    <Avatar aria-hidden='true' className={className}>
      {avatar && <AvatarImage src={avatar} alt='' className='object-cover' />}
      <AvatarFallback>
        {Array.from(username.trim()).slice(0, 2).join('').toUpperCase()}
      </AvatarFallback>
    </Avatar>
  )
}
