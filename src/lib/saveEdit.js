import { pollStagedStatus } from './pollStagedStatus'

const UPLOAD_WORKER_URL = 'https://cde-data-upload.fkw24.workers.dev'

const ENDPOINTS = {
  'main-sheet': '/main-sheet',
  'claim-calculator': '/claim-calculator',
  'upcoming-work': '/upcoming-work',
}

// The one place that actually saves a {jobNumber, col, value} edit —
// used by every manual editable field (Job checklist, Monthly claims,
// Upcoming work) and by the command box, so there's exactly one save
// path to keep correct rather than three near-identical copies of it.
export async function saveEdit(target, jobNumber, col, value) {
  const path = ENDPOINTS[target]
  if (!path) throw new Error(`Unknown save target: ${target}`)

  let res
  try {
    res = await fetch(`${UPLOAD_WORKER_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ edits: [{ jobNumber, col, value }] }),
    })
  } catch (err) {
    return { status: 'error', message: `Could not reach the upload service: ${String(err.message ?? err)}` }
  }

  const payload = await res.json().catch(() => null)
  if (!res.ok) {
    return { status: 'error', message: payload?.message ?? `Save failed (${res.status}).` }
  }

  const result = await pollStagedStatus(payload.staged)
  if (result.status === 'done') return { status: 'done', message: result.message }
  if (result.status === 'failed') return { status: 'failed', message: result.message }
  return { status: 'timeout', message: 'Still processing after 3 minutes — check back shortly; the change may still land.' }
}
