import { useEffect, useRef, useState } from 'react'
import { getAppData, setAppData } from './appData'

// Like useLocalStorageState, but the value lives in Cloudflare KV so every
// device sees the same figures — the same move the weekly/completion check
// sheets already made.
//
// The staff roster and the capacity overrides were browser-only, which meant
// the person who typed them was the only person who could see them, and
// clearing site data threw them away with no warning. Those are real planning
// numbers that Hours available and Balance are computed from, so two people
// could read different capacity for the same month and neither would know.
//
// localStorage is still used, for two reasons:
//   1. It paints instantly. KV is a network round-trip, and without a local
//      seed the roster would flash "No staff added yet" on every load.
//   2. It's the migration path. Whatever is already in a browser gets pushed
//      up the first time that browser opens the page against an empty key,
//      so nobody has to retype what they entered before this change.
//
// KV always wins once it answers: it is the shared truth, localStorage is
// only a cache of it.
export function useSharedState(kvKey, localKey, initialValue) {
  const [state, setState] = useState(() => {
    try {
      const cached = localStorage.getItem(localKey)
      return cached !== null ? JSON.parse(cached) : initialValue
    } catch {
      return initialValue
    }
  })
  const [saveFailed, setSaveFailed] = useState(false)
  // Ignore the initial fetch if the user has already typed something — their
  // edit is newer than whatever was in flight.
  const dirty = useRef(false)

  useEffect(() => {
    let cancelled = false
    getAppData(kvKey).then((remote) => {
      if (cancelled || dirty.current) return
      if (remote !== null && remote !== undefined) {
        setState(remote)
        try {
          localStorage.setItem(localKey, JSON.stringify(remote))
        } catch {
          // Cache only — the value is safe in KV either way.
        }
        return
      }
      // Nothing shared yet: adopt this browser's local value, if any.
      try {
        const cached = localStorage.getItem(localKey)
        if (cached !== null) {
          const parsed = JSON.parse(cached)
          setAppData(kvKey, parsed).then((ok) => {
            if (!cancelled && !ok) setSaveFailed(true)
          })
        }
      } catch {
        // Nothing worth migrating.
      }
    })
    return () => {
      cancelled = true
    }
    // kvKey/localKey are constants per call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function update(value) {
    dirty.current = true
    setState((prev) => {
      const next = typeof value === 'function' ? value(prev) : value
      try {
        localStorage.setItem(localKey, JSON.stringify(next))
      } catch {
        // Cache write failed; KV is what matters.
      }
      setAppData(kvKey, next).then((ok) => setSaveFailed(!ok))
      return next
    })
  }

  return [state, update, saveFailed]
}
