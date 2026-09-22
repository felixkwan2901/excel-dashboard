#!/usr/bin/env node
// Publish the real job list for the field app.
//
//   node scripts/publish-field-jobs.mjs [--dry-run]
//
// The field app used to run on invented jobs. This is what replaces them: the
// job numbers and names straight out of the workbook, written to KV under
// planning:field-jobs, where the field Worker can read them.
//
// What the workbook has is a number and a name. It has no address column, no
// commercial/residential marker and no record of who is on a job, so none of
// that is published — the field app shows those as absent rather than
// inventing them.
//
// `type` is the one field added by hand, and it is what gives a job its
// checklist. This script never overwrites one: whatever has already been set
// against a job is carried through to the new list, so re-running after a
// weekly upload adds new jobs without undoing anyone's work.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import XLSX from 'xlsx'

const KEY = 'planning:field-jobs'
const NS = '1bed6e14dbf047ac8616ae21ed09a9f6'
const WORKBOOK = 'public/Cassidy_Davies_Electrical_BPMN_Data.xlsx'
const SHEET = 'Deliverables Sheet'

const dryRun = process.argv.includes('--dry-run')

const wrangler = (args) =>
  execFileSync('npx', ['wrangler', ...args], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] })

function readExisting() {
  try {
    return JSON.parse(wrangler(['kv', 'key', 'get', KEY, '--namespace-id', NS, '--remote']))
  } catch {
    return []
  }
}

// Jobs are one row per week, so the same number appears many times. First
// spelling of the name wins — later weeks sometimes carry a truncated one.
function jobsFromWorkbook() {
  const wb = XLSX.read(readFileSync(WORKBOOK))
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[SHEET], { header: 1, blankrows: false, defval: '' })
  const found = new Map()
  for (const row of rows) {
    const number = String(row[0] ?? '').trim()
    const name = String(row[1] ?? '').trim()
    if (!/^[0-9]{3,6}$/.test(number) || !name) continue
    if (!found.has(number)) found.set(number, name)
  }
  return [...found].map(([jobNumber, jobName]) => ({ jobNumber, jobName }))
}

const existing = readExisting()
const byNumber = new Map(
  (Array.isArray(existing) ? existing : []).map((j) => [String(j.jobNumber), j]),
)

const next = jobsFromWorkbook().map((job) => {
  const before = byNumber.get(job.jobNumber)
  return {
    ...job,
    // Carried through, never regenerated. These are the fields somebody set
    // by hand and the workbook knows nothing about.
    ...(before?.type ? { type: before.type } : {}),
    ...(before?.site ? { site: before.site } : {}),
  }
})

const added = next.filter((j) => !byNumber.has(j.jobNumber))
const typed = next.filter((j) => j.type).length

console.log(`${next.length} job(s) from the workbook`)
console.log(`  ${added.length} new: ${added.map((j) => j.jobNumber).join(', ') || '—'}`)
console.log(`  ${typed} with a checklist type set, ${next.length - typed} without`)

if (next.length - typed > 0) {
  console.log('\nJobs without a type show as "not broken down yet" and have no tasks.')
  console.log('Set one with:  node scripts/set-field-job-type.mjs <jobNumber> <commercial|residential>')
}

if (dryRun) {
  console.log('\n(dry run — nothing written)')
} else {
  wrangler(['kv', 'key', 'put', KEY, JSON.stringify(next), '--namespace-id', NS, '--remote'])
  console.log(`\nWrote ${KEY}.`)
}
