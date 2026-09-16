// Importing job owners from Katipolt's Jobs export.
//
// The owner is the one field on a job that has never had a route into the
// workbook. The weekly Profit and Loss export carries no owner at all — its
// sheets are Quotes, Summary, Budgeted and Non-Budgeted, and none of them
// names a person — so Main Sheet column C has only ever been filled in by
// hand, or left blank. Ten of twenty-eight jobs were blank.
//
// Katipolt's Jobs export is a different file and does know the owner, because
// the Jobs view can be filtered by it. What it exports is whichever columns
// that view was showing, so the owner column's heading is not fixed and its
// position certainly isn't. Everything below therefore matches on the header
// text and reports which header it used. Reading by position is what made the
// onboarding checklist brittle (see onboardingChecklist.js), and here it would
// be worse than brittle: a Jobs export with its columns reordered would write
// customer names into the owner column and nothing would look wrong.

// The people who own jobs. Anything else in the export is reported rather
// than written, so a typo or a departed staff member can't quietly become an
// owner — and so the list on screen stays the list the company agreed.
export const JOB_OWNERS = ['Cameron Skilton', 'Charles Roselier', 'Tom Price']

const OWNER_HEADER_RE =
  /^(job\s*)?(owner|manager|project\s*manager|account\s*manager|estimator|assigned\s*to|responsible)$/i
const JOB_NUMBER_HEADER_RE = /^job\s*(no\.?|number|#)$/i

const clean = (v) => String(v ?? '').trim()

// Katipolt's export puts a blank row above the headings, and there is no
// promise it will stay one row. Find the heading row by looking for the job
// number column rather than counting rows.
export function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 20); i += 1) {
    const row = rows[i] ?? []
    if (row.some((cell) => JOB_NUMBER_HEADER_RE.test(clean(cell)))) return i
  }
  return -1
}

// Reads { jobNumber, owner } pairs out of a parsed Jobs export.
//
// Returns an `error` rather than throwing or returning an empty list, because
// the most likely outcome by far is that the Owner column simply wasn't shown
// in Katipolt when the export was taken. That needs to say so in those words,
// not look like a file with no owners in it.
export function readOwnerRows(rows) {
  const headerIndex = findHeaderRow(rows)
  if (headerIndex === -1) {
    return { ok: false, error: 'No "Job No." column in this file — it may not be a Katipolt Jobs export.' }
  }
  const header = (rows[headerIndex] ?? []).map(clean)
  const jobCol = header.findIndex((h) => JOB_NUMBER_HEADER_RE.test(h))
  const ownerCol = header.findIndex((h) => OWNER_HEADER_RE.test(h))
  if (ownerCol === -1) {
    return {
      ok: false,
      error:
        'This export has no owner column. In Katipolt, add "Owner" to the columns shown on the Jobs view, then export again.',
      header,
    }
  }

  const entries = []
  for (const row of rows.slice(headerIndex + 1)) {
    const jobNumber = clean(row?.[jobCol]).replace(/\.0$/, '')
    if (!/^\d+$/.test(jobNumber)) continue
    const owner = clean(row?.[ownerCol])
    if (!owner) continue
    entries.push({ jobNumber, owner })
  }
  return { ok: true, ownerHeader: header[ownerCol], entries }
}

// Works out what would actually change, without changing anything.
//
// Split four ways rather than two, because "nothing happened" has several
// different meanings here and they need different actions from the reader: a
// name we don't recognise is a decision for a person, a job number we don't
// hold is usually just a Katipolt job that isn't on the dashboard, and an
// owner that already matches is the healthy case.
export function planOwnerEdits(entries, jobs, owners = JOB_OWNERS) {
  const known = new Map((jobs ?? []).map((j) => [String(j.jobNumber), j]))
  const canonical = new Map(owners.map((o) => [o.toLowerCase(), o]))

  const changes = []
  const unchanged = []
  const unrecognisedName = []
  const notOnDashboard = []
  const seen = new Set()

  for (const { jobNumber, owner } of entries) {
    // The export can hold several rows for one job (variations); the first
    // owner wins, and a later disagreement is not worth a second write.
    const key = clean(jobNumber)
    if (seen.has(key)) continue
    seen.add(key)

    const job = known.get(key)
    if (!job) {
      notOnDashboard.push({ jobNumber: key, owner })
      continue
    }
    // Trimmed and lowercased here as well as in readOwnerRows: this function
    // is exported on its own, and an untrimmed name silently landing in
    // "unrecognised" would read as a staffing problem rather than whitespace.
    const name = canonical.get(clean(owner).toLowerCase())
    if (!name) {
      unrecognisedName.push({ jobNumber: key, jobName: job.jobName, owner: clean(owner) })
      continue
    }
    const current = clean(job.jobOwner)
    if (current === name) unchanged.push({ jobNumber: key, owner: name })
    else changes.push({ jobNumber: key, jobName: job.jobName, from: current, to: name })
  }

  return { changes, unchanged, unrecognisedName, notOnDashboard }
}

// Main Sheet column C, 0-based, the same index loadWorkbook.js reads the owner
// from and the same shape /main-sheet already accepts for checklist edits.
export const OWNER_COL = 2

export function ownerEditsPayload(changes) {
  return changes.map((c) => ({ jobNumber: c.jobNumber, col: OWNER_COL, value: c.to }))
}
