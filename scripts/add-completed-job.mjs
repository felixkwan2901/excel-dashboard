#!/usr/bin/env node
// Adds one completed job's GP/hour to public/completed-jobs.json, which the
// dashboard's "Completed jobs" tab reads.
//
// Usage:
//   node scripts/add-completed-job.mjs <ProfitAndLoss export.xlsx> [Timesheet export.xlsx] [options]
//   (for a whole month's folder of exports, use add-completed-jobs.mjs instead)
//
// Two job types, detected from the export's own sheet names:
//
//   Quoted   ("Quotes" sheet present) — job number/name come from the
//            Quotes sheet. Profit is the Summary sheet's Quoted Profit
//            (Total row). Actual hours default to the Budgeted sheet's
//            Labour "Actual Quantity" (an aggregate, no worker names) — pass
//            a Timesheet export as the second argument to get a real
//            per-worker breakdown instead (and a total that matches it).
//
//   Charge-up ("Sold"/"Unsold" sheets, no "Quotes" sheet) — these exports
//            carry no job number or name at all, so pass --job-number and
//            --job-name yourself.
//
// Labour only: a quoted job's profit is Labour Quoted Cost − Labour Actual Cost;
// a charge-up job's is Labour Actual Sell − Labour Actual Cost. GP/hour = that
// profit ÷ actual hours (charge-up: Sold labour hours); each person's part is GP/hour × their hours.
//
// Options:
//   --job-number=1234       required for a charge-up export
//   --job-name="..."        required for a charge-up export
//   --dry-run               compute and print, but don't write the file
//
// Run with no options against the real export to add it for real; run with
// --dry-run first if you just want to sanity-check the numbers.

import { resolve, basename } from 'node:path'
import { readWorkbook, exportKind, parseQuoted, parseChargeUp, toRecord, upsertCompletedJobs } from './lib/completed-job.mjs'

const args = process.argv.slice(2)
const positional = args.filter((a) => !a.startsWith('--'))
const flags = Object.fromEntries(
  args.filter((a) => a.startsWith('--')).map((a) => {
    const [key, ...rest] = a.slice(2).split('=')
    return [key, rest.length ? rest.join('=') : true]
  })
)
const [plPath, timesheetPath] = positional
if (!plPath) {
  console.error('Usage: node scripts/add-completed-job.mjs <ProfitAndLoss export.xlsx> [Timesheet export.xlsx] [--job-number=1234] [--job-name="..."] [--dry-run]')
  process.exit(1)
}

const workbook = readWorkbook(plPath)
const kind = exportKind(workbook)
if (!kind) {
  console.error(`Don't recognise this export's sheets (${workbook.SheetNames.join(', ')}) as either a quoted or charge-up P&L export.`)
  process.exit(1)
}
let record
if (kind === 'quoted') {
  const result = parseQuoted(workbook, timesheetPath ? readWorkbook(timesheetPath) : null)
  record = toRecord(result, { sourceFile: basename(plPath), timesheetFile: timesheetPath ? basename(timesheetPath) : undefined })
} else {
  const jobNumber = flags['job-number'] ? String(flags['job-number']).trim() : null
  const jobName = flags['job-name'] ? String(flags['job-name']).trim() : null
  if (!jobNumber || !jobName) {
    console.error('This is a charge-up export — it has no job number or name in it. Pass --job-number=1234 and --job-name="..." yourself.')
    process.exit(1)
  }
  record = toRecord(parseChargeUp(workbook), { jobNumber, jobName, sourceFile: basename(plPath) })
}

console.log(JSON.stringify(record, null, 2))
if (flags['dry-run']) { console.log('\n(--dry-run — nothing written)'); process.exit(0) }
const total = upsertCompletedJobs(resolve('public/completed-jobs.json'), [record])
console.log(`\nWrote public/completed-jobs.json (${total} completed job${total === 1 ? '' : 's'} total).`)
