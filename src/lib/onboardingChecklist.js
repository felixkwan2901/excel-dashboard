import { currentWeekStart } from './weekStart'

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
export const LINK_STORAGE_KEYS = { weekly: 'weeklyCheckSheet', completion: 'jobCompletionChecklist' }

// Items 18/19 can't be marked Yes until every sub-item on their linked
// checklist (Weekly Job Check Sheet / Job Completion Checklist) is either
// done or N/A — that linked checklist is stored client-side (see
// WeeklyCheckSheetTab/JobCompletionChecklistTab), so read it straight out
// of localStorage rather than threading its state through props.
export function isLinkedChecklistComplete(link, jobNumber) {
  try {
    const raw = localStorage.getItem(`${LINK_STORAGE_KEYS[link]}:${jobNumber}`)
    if (!raw) return false
    const stored = JSON.parse(raw)
    // The weekly sheet resets every Saturday morning — a completion saved
    // for an earlier week no longer counts as this week's item 18 being done.
    if (link === 'weekly' && (!stored.weekOf || stored.weekOf < currentWeekStart())) return false
    const items = stored.items ?? []
    return items.length >= LINK_ITEM_COUNTS[link] && items.every((i) => i.done || i.na)
  } catch {
    return false
  }
}

const JOB_CREATED_KEY_PREFIX = 'jobCreatedAt'
const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000

// Stamped once, right when a brand-new job is successfully added via
// UpdateData.jsx's "Add a new job" form — there's no "date created" column
// anywhere in the workbook, so this is the only record of when a job first
// showed up on the site, and it's what the 2-week items (1, 11, 15, 16) use
// to decide they're overdue. Existing/legacy jobs never get this stamped,
// so they're deliberately exempt — there's no meaningful "2 weeks from"
// date for a job that already existed before this feature did.
export function recordJobCreated(jobNumber) {
  try {
    localStorage.setItem(`${JOB_CREATED_KEY_PREFIX}:${jobNumber}`, new Date().toISOString())
  } catch {
    // Private browsing / storage full — the alert just won't fire for
    // this job, not worth failing job creation over.
  }
}

// True once 14+ days have passed since a job was stamped as created —
// false (never flashing) for any job that was never stamped, i.e. every
// job that existed before this feature, or before add-new-job started
// recording it.
export function isTwoWeeksOverdue(jobNumber) {
  try {
    const stamp = localStorage.getItem(`${JOB_CREATED_KEY_PREFIX}:${jobNumber}`)
    if (!stamp) return false
    return Date.now() - new Date(stamp).getTime() >= TWO_WEEKS_MS
  } catch {
    return false
  }
}
