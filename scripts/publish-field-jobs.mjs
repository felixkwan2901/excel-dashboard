#!/usr/bin/env node
// Publish the real job list for the field app.
//
//   node scripts/publish-field-jobs.mjs [--dry-run]
//
// The field app used to run on invented jobs. This is what replaces them: the
// job numbers and names straight out of the workbook, written to KV under
// planning:field-jobs, where the field Worker can read them.
//
// What the workbook has is a number and a name, and no address column, so
// site details stay absent rather than being invented.
//
// The checklist a job gets is NOT typed in twice. It comes from the type of
// work already set on the Projects tab: Commercial New Build and the other
// commercial categories get the commercial checklist, the residential ones
// get residential. Setting it in two places is how two places end up
// disagreeing, and the dashboard dropdown is where that decision already
// lives.
//
// Archived jobs are left out entirely. They are finished — nobody is standing
// on that site tapping percentages, and a list of thirty-five where seven are
// dead is a list people scroll past.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import XLSX from 'xlsx'
import { CATEGORY_SITE_TYPE } from '../src/lib/jobCategories.js'

const KEY = 'planning:field-jobs'
const CATEGORIES_KEY = 'planning:job-categories'
const NS = '1bed6e14dbf047ac8616ae21ed09a9f6'
const WORKBOOK = 'public/Cassidy_Davies_Electrical_BPMN_Data.xlsx'
const ARCHIVED = 'public/archived-jobs.json'
const SHEET = 'Deliverables Sheet'

const dryRun = process.argv.includes('--dry-run')

const wrangler = (args) =>
  execFileSync('npx', ['wrangler', ...args], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] })

function readKv(key, fallback) {
  try {
    return JSON.parse(wrangler(['kv', 'key', 'get', key, '--namespace-id', NS, '--remote']))
  } catch {
    return fallback
  }
}

function readArchived() {
  try {
    return new Set(JSON.parse(readFileSync(ARCHIVED, 'utf8')).map(String))
  } catch {
    // Better to publish everything than to silently drop the whole list
    // because one file is missing.
    console.warn(`Could not read ${ARCHIVED} — nothing will be treated as archived.`)
    return new Set()
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

const existing = readKv(KEY, [])
const byNumber = new Map(
  (Array.isArray(existing) ? existing : []).map((j) => [String(j.jobNumber), j]),
)
const categories = readKv(CATEGORIES_KEY, {})
const archived = readArchived()

const all = jobsFromWorkbook()
const live = all.filter((job) => !archived.has(job.jobNumber))

const next = live.map((job) => {
  const before = byNumber.get(job.jobNumber)
  const category = categories?.[job.jobNumber]
  // The category decides the checklist. A type set by hand only survives
  // where the category gives no answer — otherwise the two drift and the
  // dashboard stops being the place that decides.
  const type = CATEGORY_SITE_TYPE[category] ?? before?.type
  return {
    ...job,
    ...(category ? { category } : {}),
    ...(type ? { type } : {}),
    // Everything the workbook knows nothing about and something else wrote:
    // the address and the description come from the Jobs export via
    // import-job-details.mjs, and this run must not undo that.
    //
    // Listed explicitly rather than spreading `before` wholesale, so a field
    // the workbook DOES own can never be resurrected from a stale publish.
    ...(before?.site ? { site: before.site } : {}),
    ...(before?.scope ? { scope: before.scope } : {}),
  }
})

const added = next.filter((j) => !byNumber.has(j.jobNumber))
const typed = next.filter((j) => j.type)
const untyped = next.filter((j) => !j.type)

console.log(`${all.length} job(s) in the workbook, ${archived.size} archived, ${next.length} published`)
console.log(`  ${added.length} new: ${added.map((j) => j.jobNumber).join(', ') || '—'}`)
console.log(`  ${typed.length} with a checklist, ${untyped.length} without`)

if (untyped.length) {
  console.log('\nNo type of work set on the Projects tab, so these have no tasks:')
  for (const j of untyped) console.log(`  ${j.jobNumber}  ${j.jobName}`)
  console.log('Set the type of work in the dashboard and run this again.')
}

if (dryRun) {
  console.log('\n(dry run — nothing written)')
} else {
  wrangler(['kv', 'key', 'put', KEY, JSON.stringify(next), '--namespace-id', NS, '--remote'])
  console.log(`\nWrote ${KEY}.`)
}
