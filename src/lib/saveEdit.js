import { pollStagedStatus } from './pollStagedStatus'
import { setOverride, clearOverride } from './overrides'

const UPLOAD_WORKER_URL = 'https://cde-data-upload.fkw24.workers.dev'

const ENDPOINTS = {
  'main-sheet': '/main-sheet',
  'claim-calculator': '/claim-calculator',
  'upcoming-work': '/upcoming-work',
}

// The one place that actually saves a {jobNumber, col, value} edit — used
// by every manual editable field (Job checklist, Monthly claims, Upcoming
// work) and by the command box.
//
// Two layers: a KV "override" overlay (src/lib/overrides.js) written
// FIRST and awaited here — that's the whole edit, from the caller's point
// of view, done in under a second and visible on every device immediately
// (loadWorkbook.js reads it back). The real Excel edit is then staged and
// polled in the BACKGROUND, not awaited by the caller — it still takes
// its usual 30-90s to merge, but nothing is waiting on it anymore. Once
// that merge lands (or fails), the override entry is cleared: on success
// because Excel itself now has the right value and the overlay would just
// be dead weight from then on; on failure so a save that never actually
// landed doesn't keep masking Excel's real value forever.
export async function saveEdit(target, jobNumber, col, value) {
  const path = ENDPOINTS[target]
  if (!path) throw new Error(`Unknown save target: ${target}`)

  try {
    await setOverride(target, jobNumber, col, value)
  } catch (err) {
    return { status: 'error', message: `Could not save: ${String(err.message ?? err)}` }
  }

  stageRealEdit(path, target, jobNumber, col, value)

  return { status: 'done', message: 'Saved — syncing to the workbook in the background.' }
}

async function stageRealEdit(path, target, jobNumber, col, value) {
  try {
    const res = await fetch(`${UPLOAD_WORKER_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ edits: [{ jobNumber, col, value }] }),
    })
    if (!res.ok) {
      await clearOverride(target, jobNumber, col)
      return
    }
    const payload = await res.json().catch(() => null)
    const result = await pollStagedStatus(payload?.staged)
    // Only clear on a definite outcome — a 'timeout' just means the poll
    // gave up waiting, not that the edit failed; leave the override in
    // place so the site keeps showing the right value either way.
    if (result.status === 'done' || result.status === 'failed') {
      await clearOverride(target, jobNumber, col)
    }
  } catch {
    // Network hiccup staging the real edit — leave the override in place
    // (still the best info we have) rather than silently clearing it.
  }
}
