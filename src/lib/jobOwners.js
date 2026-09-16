// Who owns a job, and how that reaches the workbook.
//
// The owner lives in Main Sheet column C. Nothing has ever written it: the
// weekly Profit and Loss export from Katipolt carries no owner at all — its
// sheets are Quotes, Summary, Budgeted and Non-Budgeted, and none of them
// names a person — so the column was filled in by hand when a job was created,
// or not at all. Ten of twenty-eight jobs had no owner.
//
// This is that typing, moved into the site: pick from a list, save once.

// The three people who own jobs. A list rather than free text because the
// column already held "Tom" and "Cameron" against "Tom Price" and "Cameron
// Skilton" elsewhere, and two spellings of one person is two owners as far as
// any grouping or filter is concerned.
export const JOB_OWNERS = ['Cameron Skilton', 'Charles Roselier', 'Tom Price']

// Main Sheet column C, 0-based — the same index loadWorkbook.js reads the
// owner from, and the shape /main-sheet already accepts for checklist edits.
export const OWNER_COL = 2

const clean = (v) => String(v ?? '').trim()

// What the dropdown should start on for a job.
//
// An existing value that isn't one of the three (the old "Tom" and "Cameron")
// reads as unset, so the list shows what still needs choosing rather than
// implying those short names are settled. The stored value is left alone until
// somebody picks something — displaying it as blank must not be the same as
// clearing it.
export function selectedOwner(job) {
  const current = clean(job?.jobOwner)
  return JOB_OWNERS.includes(current) ? current : ''
}

// Only the rows actually touched, and only where the choice differs from
// what's stored. `draft` is { [jobNumber]: chosenName }; a job missing from it
// was never touched and is not an edit.
export function planOwnerEdits(draft, jobs) {
  const changes = []
  for (const job of jobs ?? []) {
    const jobNumber = String(job.jobNumber)
    if (!(jobNumber in (draft ?? {}))) continue
    const to = clean(draft[jobNumber])
    if (to && !JOB_OWNERS.includes(to)) continue
    const from = clean(job.jobOwner)
    if (to === from) continue
    changes.push({ jobNumber, jobName: job.jobName, from, to })
  }
  return changes
}

export function ownerEditsPayload(changes) {
  return changes.map((c) => ({ jobNumber: c.jobNumber, col: OWNER_COL, value: c.to }))
}
