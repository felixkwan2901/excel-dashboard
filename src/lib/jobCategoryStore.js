import { getAppData, setAppData } from './appData'
import { CATEGORIES_KEY } from './jobCategories'

// One blob, { [jobNumber]: category }, rather than a key per job: the Worker
// has no list endpoint, so per-job keys could not be read back without
// already knowing every job number. Same trade the owner map makes, and the
// same accepted risk — two people categorising in the same second could lose
// one of the two. A job's category is set once and rarely revisited.
export async function fetchJobCategories() {
  return (await getAppData(CATEGORIES_KEY)) ?? {}
}

// Read-modify-write. Returns the map actually saved, or null if the write did
// not reach the server — a dropdown must never keep showing a category that
// was never stored.
export async function saveJobCategory(jobNumber, category) {
  const current = await fetchJobCategories()
  const next = { ...current }
  const value = String(category ?? '').trim()
  if (value) next[String(jobNumber)] = value
  else delete next[String(jobNumber)]
  const ok = await setAppData(CATEGORIES_KEY, next)
  return ok ? next : null
}
