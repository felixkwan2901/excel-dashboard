const UPLOAD_WORKER_URL = 'https://cde-data-upload.fkw24.workers.dev'

// Cloudflare KV-backed storage for the handful of things that have no home
// in the tracked Excel workbook (Weekly Job Check Sheet, Job Completion
// Checklist, a new job's "first entered the site" timestamp) — replaces
// what used to be per-browser localStorage with something that syncs
// across devices. Keys are namespaced "weekly:<jobNumber>" /
// "completion:<jobNumber>" / "jobCreated:<jobNumber>" (the Worker only
// accepts those three prefixes).

export async function getAppData(key) {
  try {
    const res = await fetch(`${UPLOAD_WORKER_URL}/app-data?key=${encodeURIComponent(key)}`)
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

export async function setAppData(key, value) {
  try {
    await fetch(`${UPLOAD_WORKER_URL}/app-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value: JSON.stringify(value) }),
    })
  } catch {
    // Best-effort — a failed sync here just means this browser keeps
    // showing its own optimistic state until the next successful save.
  }
}
