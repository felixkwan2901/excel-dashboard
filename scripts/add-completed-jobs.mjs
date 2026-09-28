#!/usr/bin/env node
// Loads a month of completed-job exports into public/completed-jobs.json in one pass.
//
// Usage: node scripts/add-completed-jobs.mjs <folder> [--dry-run]
//
// The folder holds Katipolt exports renamed by job number as they were downloaded
// (a charge-up P&L export has no job number inside it, so the name is the only link):
//
//   CU-<job>.xlsx        charge-up job — its Profit & Loss export
//   Q-<job>-pl.xlsx      quoted job — its Profit & Loss export
//   Q-<job>-ts.xlsx      quoted job — its Sales & Costs → Timesheets export
//   jobs*.xlsx           optional: Katipolt Jobs list export(s), used for job names
//
// Or, straight from a Downloads folder: Katipolt's own file names plus the
// manifest.csv that the katipolt-completed-export prompt writes. Downloads are
// matched to jobs by order — Chrome names repeats "… (1).xlsx", "… (2).xlsx" — and
// each match is checked against the figure read off the screen (charge-up profit,
// quoted job number, timesheet hours). Anything that doesn't line up is refused.
//
//   manifest.csv   order,job,type,file,check   (file = pl | ts | none)
//
// Every job is reported: loaded, or skipped with the reason (e.g. no billed hours).

import { resolve } from 'node:path'
import { loadCompletedFolder, upsertCompletedJobs } from './lib/completed-job.mjs'

const args = process.argv.slice(2)
const folder = args.find((a) => !a.startsWith('--'))
const dryRun = args.includes('--dry-run')
if (!folder) { console.error('Usage: node scripts/add-completed-jobs.mjs <folder> [--dry-run]'); process.exit(1) }

const { records, skipped, problems, notes } = loadCompletedFolder(folder)
if (problems.length) {
  console.error('Manifest does not match the downloads — nothing loaded:\n  ' + problems.join('\n  '))
  process.exit(1)
}
for (const n of notes) console.log(n)
const fmt = (n) => '$' + n.toFixed(2)
console.log(`\n${records.length} job(s) read:\n`)
for (const r of records) console.log(`  ${r.type.padEnd(8)} ${r.jobNumber.padEnd(6)} ${fmt(r.gpPerHour).padStart(10)}/hr  ${fmt(r.profit).padStart(11)}  ${String(r.hours).padStart(6)} h  ${r.jobName}`)
if (skipped.length) {
  console.log(`\nNeeds a look (${skipped.length}):`)
  for (const s of skipped) console.log(`  ${s.job.padEnd(6)} ${s.file}: ${s.reason}`)
}
if (dryRun) { console.log('\n(--dry-run — nothing written)'); process.exit(0) }
const total = upsertCompletedJobs(resolve('public/completed-jobs.json'), records)
console.log(`\nWrote public/completed-jobs.json (${total} completed jobs total).`)
