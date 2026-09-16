import { isCurrentWeek } from './weekStart'
import { getAppData, setAppData } from './appData'

// The exact 19 items from the paper "Job Onboarding Checklist" — in order,
// replacing whatever the workbook's own Main Sheet column headers happen to
// say. Each item still saves to the Nth Main Sheet column positionally
// (columns[i]), so no workbook/pipeline change was needed for the wording
// swap. `twoWeek` marks the items the paper form annotates with a 2-week
// target from job start (1, 11, 15, 16). Shared between MainSheetTab (the
// manual UI) and CommandBox (the AI command box) so both enforce the same
// item 4 / 18 / 19 special cases from one place.
export const ONBOARDING_ITEMS = [
  { label: 'Get job handover from Estimating / Design', twoWeek: true },
  { label: 'Do we require any PS1 or PS3 work' },
  { label: 'Accept job in Katipult' },
  { label: 'Load retentions (if required)', retentionInput: true },
  { label: 'Load purchase order number' },
  { label: 'Load job contact details correctly' },
  { label: "Add job to Procore (or project's tracking platform)" },
  { label: 'Create WhatsApp group' },
  { label: 'Load contract and programme to job files' },
  { label: 'Check drawings are the current revision, not a superseded set' },
  { label: 'Confirm supply authority / ICP application lodged', twoWeek: true },
  { label: 'SSSP paperwork done and ready for the job' },
  { label: 'Organise handover meeting with tradesman, print and load paperwork (plans, spec sheets etc.)' },
  { label: "Confirm with builder's PM whether progress claims apply" },
  { label: 'Order long lead time materials', twoWeek: true },
  { label: 'Send away subcontractor PO', twoWeek: true },
  { label: 'O&M Manual started — completed as far as possible' },
  { label: 'Weekly Job Checklist completed', link: 'weekly' },
  { label: 'Job completion checklist completed', link: 'completion' },
]

export const LINK_ITEM_COUNTS = { weekly: 9, completion: 11 }

// Which item is the one tied to the Weekly Job Check Sheet. Derived from the
// list rather than written as `17` so reordering or inserting an item can't
// quietly point the week-expiry rule below at the wrong row.
export const WEEKLY_ITEM_INDEX = ONBOARDING_ITEMS.findIndex((i) => i.link === 'weekly')

// KV key prefixes for the linked checklists — "weekly:<jobNumber>" /
// "completion:<jobNumber>", the same prefixes the Worker's /app-data route
// accepts (see upload-worker/src/index.js's APP_DATA_KEY_RE).
export const LINK_STORAGE_KEYS = { weekly: 'weekly', completion: 'completion' }

// Pure/render-safe: given an already-fetched record (or null), says
// whether every sub-item on that linked checklist is done or N/A. Split
// out from the fetch itself so callers can fetch once (e.g. when a job is
// selected) and reuse the result across a render loop, rather than
// awaiting inside render.
export function isLinkedChecklistCompleteFromRecord(link, record) {
  if (!record) return false
  // The weekly sheet resets every Saturday morning — a completion saved
  // for an earlier week no longer counts as this week's item 18 being done.
  if (link === 'weekly' && !isCurrentWeek(record.weekOf)) return false
  const items = record.items ?? []
  // `na` is only ever a legacy value now that the N/A option is gone; an item
  // carrying one was settled at the time, so it still counts.
  return items.length >= LINK_ITEM_COUNTS[link] && items.every((i) => i.done || i.na)
}

// Fetches the linked checklist's current record from KV (shared across
// devices) for a single job. Callers needing to gate a render decision
// should fetch once (e.g. on job selection) into state, then use
// isLinkedChecklistCompleteFromRecord synchronously against that state.
export async function fetchLinkedChecklistRecord(link, jobNumber) {
  return getAppData(`${LINK_STORAGE_KEYS[link]}:${jobNumber}`)
}

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000

// Stamped once, right when a brand-new job is successfully added via
// UpdateData.jsx's "Add a new job" form — there's no "date created" column
// anywhere in the workbook, so this is the only record of when a job first
// showed up on the site, and it's what the 2-week items (1, 11, 15, 16) use
// to decide they're overdue. Existing/legacy jobs never get this stamped,
// so they're deliberately exempt — there's no meaningful "2 weeks from"
// date for a job that already existed before this feature did.
export async function recordJobCreated(jobNumber) {
  await setAppData(`jobCreated:${jobNumber}`, new Date().toISOString())
}

// Fetches a job's "first entered the site" stamp (or null if never
// recorded — a legacy job, or one added before this feature existed).
export async function fetchJobCreatedAt(jobNumber) {
  return getAppData(`jobCreated:${jobNumber}`)
}

// Pure/render-safe: true once 14+ days have passed since the given stamp.
// False (never flashing) for a null stamp.
export function isTwoWeeksOverdueFromStamp(stamp) {
  if (!stamp) return false
  return Date.now() - new Date(stamp).getTime() >= TWO_WEEKS_MS
}


// Whether an item counts as settled *today*.
//
// For eighteen of the nineteen items this is just "is it ticked". Item 18 is
// different: the Weekly Job Check Sheet is a per-week thing, so its tick only
// ever meant "done this week". Setting that tick is already gated on the
// linked sheet being complete for the current week (MainSheetTab's
// handleChange refuses otherwise) — but nothing ever cleared it again. A tick
// set one Thursday sat there through every following Saturday, so the row
// showed a green tick and the red overdue flash at the same time and gave you
// no way to tell which one was lying. Job 8824 carried a tick from 3
// September through two week-rollovers.
//
// The tick is derived rather than unset: writing a blank back would mean the
// app editing the client's workbook on a timer, unattended, across every job.
// The stored column keeps whatever it holds; this decides what it means now.
export function isItemSettledNow(item, storedValue, weeklyRecord) {
  const stored = storedValue === 'Yes' || storedValue === 'N/A'
  if (!stored) return false
  // Only the weekly item expires. A job completion checklist doesn't reset
  // every Saturday, so item 19's tick stands on its own.
  if (item?.link !== 'weekly') return true
  return isLinkedChecklistCompleteFromRecord('weekly', weeklyRecord)
}
