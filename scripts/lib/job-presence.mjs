import { isValidJobBlock } from './job-blocks.mjs'

// Every job should exist on all four sheets the dashboard reads. Adding one is
// meant to write all four, but job 8530 ended up only in the Deliverables
// Sheet and Main Sheet — add-new-job.mjs reported "Claim Calculator row 67,
// Upcoming Work row 67" and those rows came out empty. It then showed on the
// Projects tab and nowhere else.
//
// The existing consistency check compares *figures* between two sheets, so it
// had nothing to say about a job being absent entirely, and the run still
// printed "every tab's data is confirmed in sync". This closes that gap: it
// asks the simpler question of whether each job is present at all.
//
// Job rows on the Claim Calculator and Upcoming Work sheets alternate with
// blank spacer rows, which is worth knowing when reading a row number out of
// that log — 67 was a spacer, not the next job row.
const SHEETS = ['Main Sheet', 'Claim Calculator By Month', 'Upcoming Work Calculator']

function jobNumbersIn(worksheet) {
  const found = new Set()
  if (!worksheet) return found
  worksheet.eachRow((row) => {
    const raw = row.getCell(1).value
    const num = raw && typeof raw === 'object' ? (raw.result ?? raw.value) : raw
    if (typeof num === 'number' && num > 0) found.add(num)
  })
  return found
}

// Returns [{ jobNumber, jobName, missingFrom: [...] }] for anything in the
// Deliverables Sheet that isn't on one of the other tabs.
export function findJobsMissingFromSheets(workbook, deliverablesBlocks) {
  const present = new Map()
  for (const name of SHEETS) present.set(name, jobNumbersIn(workbook.getWorksheet(name)))

  const gaps = []
  for (const block of deliverablesBlocks.filter(isValidJobBlock)) {
    const num = Number(block.jobNumber)
    const missingFrom = SHEETS.filter((name) => !present.get(name).has(num))
    if (missingFrom.length > 0) {
      gaps.push({ jobNumber: num, jobName: String(block.jobName ?? '').trim(), missingFrom })
    }
  }
  return gaps
}

export function formatMissingJobsReport(gaps) {
  if (gaps.length === 0) return null
  const lines = [
    '',
    `WARNING: ${gaps.length} job(s) are on the Deliverables Sheet but missing from other tabs.`,
    'They will show on Projects and nowhere else until the missing rows are added:',
  ]
  for (const g of gaps) {
    lines.push(`  ${g.jobNumber}  ${g.jobName} — missing from: ${g.missingFrom.join(', ')}`)
  }
  return lines.join('\n')
}
