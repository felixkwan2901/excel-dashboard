import { getAppData, setAppData } from './appData'
import { OWNERS_KEY } from './jobOwners'

// One blob, { [jobNumber]: name }, rather than a key per job: the Worker has
// no list endpoint, so per-job keys could not be read back without already
// knowing every job number. Same trade the override blob makes, and the same
// accepted risk — two people changing an owner in the same second could lose
// one of the two. Owners change a handful of times a year.
export async function fetchJobOwners() {
  return (await getAppData(OWNERS_KEY)) ?? {}
}

// Read-modify-write. Returns the map actually saved, or null if the write did
// not reach the server — a dropdown must never keep showing a name that was
// never stored.
export async function saveJobOwner(jobNumber, name) {
  const current = await fetchJobOwners()
  const next = { ...current }
  const value = String(name ?? '').trim()
  if (value) next[String(jobNumber)] = value
  else delete next[String(jobNumber)]
  const ok = await setAppData(OWNERS_KEY, next)
  return ok ? next : null
}
