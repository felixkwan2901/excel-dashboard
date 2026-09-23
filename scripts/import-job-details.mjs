#!/usr/bin/env node
// Put the site address and the job description onto the field app's jobs.
//
//   node scripts/import-job-details.mjs [path/to/Jobs.xlsx] [--dry-run]
//
// With no path it takes the newest "Jobs - *.xlsx" out of ~/Downloads, which
// is where the export lands, so the whole job after downloading is one
// command with nothing to type.
//
// The export carries Job No., Name, Created, Customer, Job Address, Brief
// Description, Job Stage and Tags. Two of those are worth putting in front of
// somebody on site:
//
//   Job Address       → site.address, which fills "Getting in" and gives a
//                       tap-through to Maps
//   Brief Description → scope, which is the only sentence anywhere in any
//                       system that says what the job actually is
//
// Customer is deliberately NOT imported. The field app has no sign-in — the
// URL is the only thing between it and the internet — and a client's name is
// the part of this file that has no operational use on site. Where and what,
// not who. Say the word and it is one line to add.
//
// Merged into planning:field-jobs rather than kept separately, because
// publish-field-jobs.mjs already carries `site` and anything else it does not
// own through a re-publish, so the weekly run will not wipe this.
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import XLSX from 'xlsx'

const KEY = 'planning:field-jobs'
const NS = '1bed6e14dbf047ac8616ae21ed09a9f6'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const given = args.find((a) => !a.startsWith('--'))

// The header is on the SECOND row of the sheet; the first is blank. Parsed
// without `range: 1` every column comes back as __EMPTY and every job number
// is undefined, which looks exactly like "nothing matched".
const HEADER_ROW = 1

function newestExport() {
  const dir = join(homedir(), 'Downloads')
  const candidates = readdirSync(dir)
    .filter((f) => /^Jobs.*\.xlsx$/i.test(f) && !f.startsWith('~$'))
    .map((f) => ({ f, at: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.at - a.at)
  if (!candidates.length) {
    console.error(`No "Jobs - ….xlsx" in ${dir}. Pass the path instead.`)
    process.exit(66)
  }
  return join(dir, candidates[0].f)
}

const path = given ?? newestExport()
console.log(`Reading ${path}`)

const wb = XLSX.read(readFileSync(path))
const sheet = wb.Sheets[wb.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', range: HEADER_ROW })

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim()
const fromFile = new Map()
for (const row of rows) {
  const number = clean(row['Job No.'])
  if (!number) continue
  fromFile.set(number, {
    address: clean(row['Job Address']),
    scope: clean(row['Brief Description']),
  })
}
console.log(`${fromFile.size} job(s) in the export`)

const wrangler = (a) =>
  execFileSync('npx', ['wrangler', ...a], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] })

let published
try {
  published = JSON.parse(wrangler(['kv', 'key', 'get', KEY, '--namespace-id', NS, '--remote']))
} catch {
  console.error(`No ${KEY} yet. Run: node scripts/publish-field-jobs.mjs`)
  process.exit(66)
}

let addresses = 0
let scopes = 0
const unmatched = []

const next = published.map((job) => {
  const found = fromFile.get(String(job.jobNumber))
  if (!found) {
    unmatched.push(job)
    return job
  }
  const updated = { ...job }
  if (found.address) {
    // Kept as an object so a gate code, parking note or coordinates can be
    // added later without moving what is already here.
    updated.site = { ...(job.site ?? {}), address: found.address }
    addresses += 1
  }
  if (found.scope) {
    updated.scope = found.scope
    scopes += 1
  }
  return updated
})

console.log(`${published.length} published job(s): ${addresses} got an address, ${scopes} got a description`)

if (unmatched.length) {
  // A job number that does not match is the likely failure here — a renumber,
  // or an export taken before the job existed — and it has to be visible
  // rather than showing up later as one job mysteriously having no address.
  console.log(`\n${unmatched.length} not found in the export:`)
  for (const job of unmatched) console.log(`  ${job.jobNumber}  ${job.jobName}`)
}

if (dryRun) {
  console.log('\n(dry run — nothing written)')
} else {
  wrangler(['kv', 'key', 'put', KEY, JSON.stringify(next), '--namespace-id', NS, '--remote'])
  console.log(`\nWrote ${KEY}.`)
}
