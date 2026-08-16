import { useState } from 'react'

// Persists a piece of UI state (e.g. which table columns are toggled on)
// across refreshes/sessions — without this, a preference like "hide these
// columns" lives only in React state and refreshing the page silently
// throws it away back to the defaults every time.
export function useLocalStorageState(key, initialValue, { serialize = JSON.stringify, deserialize = JSON.parse } = {}) {
  const [state, setState] = useState(() => {
    try {
      const stored = localStorage.getItem(key)
      return stored !== null ? deserialize(stored) : initialValue
    } catch {
      return initialValue
    }
  })

  function setPersistedState(value) {
    setState((prev) => {
      const next = typeof value === 'function' ? value(prev) : value
      try {
        localStorage.setItem(key, serialize(next))
      } catch {
        // Private browsing / storage full / disabled — the preference just
        // won't survive a refresh this time, not worth failing the update over.
      }
      return next
    })
  }

  return [state, setPersistedState]
}
