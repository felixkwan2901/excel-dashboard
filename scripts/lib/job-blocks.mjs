// Whether a parsed Deliverables Sheet block is a real job.
//
// This predicate decides what the whole pipeline can see. A block that fails
// it is skipped by the weekly merge, skipped by the monthly hours log, and
// ignored when add-new-job.mjs works out where to append — so a job with a
// blank name silently receives no data for as long as it exists.
//
// It used to be written out by hand in update-jobs.mjs, add-new-job.mjs and
// log-monthly-hours.mjs. Three copies of a rule this consequential is one
// edit away from the three disagreeing, so it lives here now.
//
// A block counts as a real job when it has a positive job number and a name
// that isn't blank — and isn't the literal '0', which is what an empty
// spreadsheet cell parses to in these sheets.
export function isValidJobBlock(block) {
  if (!(Number(block?.jobNumber) > 0)) return false
  const name = String(block?.jobName ?? '').trim()
  return name !== '' && name !== '0'
}
