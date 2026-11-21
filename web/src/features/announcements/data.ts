export type Announcement = {
  revision: number
  updatedAt: string
  read?: boolean
  id: string
  title: string
  content: string
  status: 'draft' | 'published' | 'archived'
  delivery: 'silent' | 'popup'
  groupIds: string[]
  startsAt: string | null
  endsAt: string | null
  createdAt: string
  readership: { recipients: number; read: number } | null
}
export type AnnouncementStatus = Announcement['status'] | 'scheduled'
export function announcementStatus(
  item: Announcement,
  now: number
): AnnouncementStatus {
  if (item.status !== 'published') return item.status
  if (item.endsAt && Date.parse(item.endsAt) <= now) return 'archived'
  if (item.startsAt && Date.parse(item.startsAt) > now) return 'scheduled'
  return 'published'
}
export function localDateInput(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16)
}
