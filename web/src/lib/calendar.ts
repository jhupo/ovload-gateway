// ISO calendar dates are sortable; never slice a UTC instant for a local day.
export function calendarDate(value: string | number | Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value))
  const part = (name: string) => parts.find((p) => p.type === name)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}
export function addCalendarDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}
// Find the first instant of a local day, including midnight DST gaps/overlaps.
export function calendarDayStart(date: string, timeZone: string) {
  const stamp = Date.parse(`${date}T00:00:00Z`)
  if (!Number.isFinite(stamp)) return NaN
  let lo = stamp - 36 * 3600000,
    hi = stamp + 36 * 3600000
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (calendarDate(mid, timeZone) < date) lo = mid + 1
    else hi = mid
  }
  return lo
}
