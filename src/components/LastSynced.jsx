import { useEffect, useState } from 'react'
import syncMetaUrl from '../../sync-meta.json?url'
import { formatRelativeTime } from '../lib/relativeTime'

const REFRESH_MS = 60 * 1000 // keep the relative label ("2 minutes ago") fresh

// `detailed` is for the Update data page, where the question is "should I
// upload again?" — a relative label alone ("5 days ago") makes you work out
// the actual day, so that variant shows the exact local date and time with
// the relative reading beside it.
export default function LastSynced({ detailed = false }) {
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

  if (!updatedAt) {
    // On the Update data page, say so rather than rendering nothing — a blank
    // space reads as "no uploads yet" just as easily as "couldn't check".
    return detailed ? (
      <p className="mb-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-[13px] text-neutral-500">
        Couldn&apos;t read when the data was last updated.
      </p>
    ) : null
  }

  if (detailed) {
    const when = new Date(updatedAt)
    const absolute = when.toLocaleString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
    return (
      <div className="mb-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
        <p className="text-[11px] font-medium tracking-wider text-neutral-500 uppercase">
          Last upload processed
        </p>
        <p className="mt-1 text-[15px] font-semibold text-neutral-100 tabular-nums">
          {absolute}
        </p>
        <p className="mt-0.5 text-[13px] text-neutral-400">{formatRelativeTime(updatedAt)}</p>
      </div>
    )
  }

  return (
    <p className="text-[13px] text-neutral-400 tabular-nums">
      Last updated: {formatRelativeTime(updatedAt)}
    </p>
  )
}
