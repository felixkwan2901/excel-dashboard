import { workerFetch } from './workerClient'

// Cloudflare KV-backed storage for the handful of things that have no home
// in the tracked Excel workbook (Weekly Job Check Sheet, Job Completion
// Checklist, a new job's "first entered the site" timestamp) — replaces
// what used to be per-browser localStorage with something that syncs
// across devices. Keys are namespaced "weekly:<jobNumber>" /
// "completion:<jobNumber>" / "jobCreated:<jobNumber>" (the Worker only
// accepts those three prefixes).

export async function getAppData(key) {
  try {
    const res = await workerFetch(`/app-data?key=${encodeURIComponent(key)}`, {}, { promptIfMissing: false })
    if (!res.ok) return null
    const { value } = await res.json()
    if (!value) return null
    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  } catch {
    return null
  }
}

// Returns true only if the value actually reached the Worker. Callers must
// use this to drive their "Saved" indicator: this used to swallow every
// failure and resolve anyway, so a tick that never left the browser still
// reported "Saved" and then vanished on the next refresh.
export async function setAppData(key, value) {
  try {
    const res = await workerFetch(
      `/app-data`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: JSON.stringify(value) }),
      },
      { promptIfMissing: false },
    )
    return res.ok
  } catch {
    return false
  }
}
