const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// Coarse, human-friendly relative time ("2 hours ago", "just now") — finer
// grained than the day-only formatting used for job activity elsewhere,
// since a sync timestamp is useful down to the minute.
export function formatRelativeTime(isoDate, now = new Date()) {
  const then = new Date(isoDate)
  const diffMs = now - then
  if (Number.isNaN(diffMs)) return ''
  if (diffMs < 0) return 'just now'

  if (diffMs < MINUTE) return 'just now'
  if (diffMs < HOUR) {
    const mins = Math.floor(diffMs / MINUTE)
    return `${mins} minute${mins === 1 ? '' : 's'} ago`
  }
  if (diffMs < DAY) {
    const hours = Math.floor(diffMs / HOUR)
    return `${hours} hour${hours === 1 ? '' : 's'} ago`
  }
  const days = Math.floor(diffMs / DAY)
  return `${days} day${days === 1 ? '' : 's'} ago`
}
