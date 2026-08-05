import { useEffect, useState } from 'react'
import syncMetaUrl from '../../sync-meta.json?url'
import { formatRelativeTime } from '../lib/relativeTime'

const REFRESH_MS = 60 * 1000 // keep the relative label ("2 minutes ago") fresh

export default function LastSynced() {
  const [updatedAt, setUpdatedAt] = useState(null)
  const [, forceTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetch(syncMetaUrl)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.updatedAt) setUpdatedAt(data.updatedAt)
      })
      .catch(() => {
        // Missing or unreadable — show nothing rather than an error.
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const interval = setInterval(() => forceTick((n) => n + 1), REFRESH_MS)
    return () => clearInterval(interval)
  }, [])

  if (!updatedAt) return null

  return (
    <p className="text-[13px] text-neutral-400 tabular-nums">
      Last updated: {formatRelativeTime(updatedAt)}
    </p>
  )
}
