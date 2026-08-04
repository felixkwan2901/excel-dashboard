const KEY = 'cde-session-id'

// A per-browser pseudonymous identifier — there's no login system in this
// app, so this is the only "who" available for the audit trail. It labels
// which browser made a change, not a real identity.
export function getSessionId() {
  try {
    let id = localStorage.getItem(KEY)
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)
      localStorage.setItem(KEY, id)
    }
    return id
  } catch {
    return ''
  }
}
