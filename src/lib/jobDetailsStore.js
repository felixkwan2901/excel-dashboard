import { getAppData, setAppData } from './appData'
import { JOB_DETAILS_KEY, JOB_DETAIL_KEYS } from './jobDetails'

// { [jobNumber]: { contactName, contactPhone, ... } }. One blob, for the same
// reason the owner and category maps are one blob: the Worker has no list
// endpoint, so per-job keys could not be read back without already knowing
// every job number.
export async function fetchJobDetails() {
  const raw = await getAppData(JOB_DETAILS_KEY)
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
}

// Read-modify-write of one field on one job. Returns the map actually saved,
// or null if the write did not reach the server — a cell must never keep
// showing text that was never stored.
//
// Unlike the owner and category writes this re-reads first and merges at the
// field level, because a job has eleven of these and two people filling in
// different ones on the same job is an ordinary Tuesday, not a collision
// worth losing a field over.
export async function saveJobDetail(jobNumber, field, value) {
  if (!JOB_DETAIL_KEYS.includes(field)) return null

  const current = await fetchJobDetails()
  const id = String(jobNumber)
  const next = { ...current }
  const entry = { ...(next[id] ?? {}) }
  const text = String(value ?? '').trim()

  if (text) entry[field] = text
  else delete entry[field]

  // Clearing the last field on a job removes the job's entry entirely rather
  // than leaving `{}` behind, so the stored blob stays the set of jobs that
  // actually have something recorded.
  if (Object.keys(entry).length) next[id] = entry
  else delete next[id]

  const ok = await setAppData(JOB_DETAILS_KEY, next)
  return ok ? next : null
}
