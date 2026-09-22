#!/usr/bin/env node
// Snapshot every key in the Worker's KV store to a directory of JSON files.
//
//   node scripts/backup-kv.mjs [outDir] [workerBaseUrl]
//
// KV has no list endpoint through this Worker and no version history, so a
// bad write cannot be undone — this is the only undo there is. Pairs with
// scripts/restore-kv.sh.
//
// The key space is enumerated from the Worker's own allowlist: the fixed
// planning/override/fieldTasks keys, plus the four per-job prefixes for
// every job the dashboard lists and every job the field app uses.
import fs from 'node:fs/promises'
import path from 'node:path'

const OUT = process.argv[2] ?? `kv-backup-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}`
const BASE = process.argv[3] ?? 'https://cde-data-upload.fkw24.workers.dev'

const FIXED = [
  'override:main-sheet', 'override:claim-calculator', 'override:upcoming-work',
  'planning:staff-roster', 'planning:servicing', 'planning:working-days',
  'planning:staff-on-tools', 'planning:avg-hourly-rate', 'planning:job-owners',
  'planning:job-checklist', 'planning:claim-fields', 'planning:upcoming-work',
  'fieldTasks:commercial', 'fieldTasks:residential',
]
const JOBS = [
  '7428', '7429', '7480', '7658', '7901', '8142', '8183', '8214', '8234', '8308',
  '8337', '8352', '8386', '8530', '8670', '8769', '8824', '8829', '8886', '8887',
  '8923', '8946', '9065', '9240', '9259', '9351', '9437', '9508',
  // field-app fixture jobs, which hold the only real progress records
  '9388', '9412', '9455', '9470',
]
const PREFIXES = ['weekly', 'completion', 'jobCreated', 'field']

const keys = [...FIXED, ...JOBS.flatMap((j) => PREFIXES.map((p) => `${p}:${j}`))]

await fs.mkdir(OUT, { recursive: true })
let saved = 0
let empty = 0
const failed = []

for (const key of keys) {
  let body
  try {
    const res = await fetch(`${BASE}/app-data?key=${encodeURIComponent(key)}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    body = await res.json()
  } catch (err) {
    failed.push(`${key}: ${err.message}`)
    continue
  }
  if (body.value === null || body.value === undefined) { empty += 1; continue }
  await fs.writeFile(path.join(OUT, `${key.replace(':', '_')}.json`), JSON.stringify(body))
  saved += 1
}

console.log(`checked ${keys.length} keys → saved ${saved}, empty ${empty}, failed ${failed.length}`)
for (const f of failed) console.log(`  FAILED ${f}`)
console.log(`→ ${path.resolve(OUT)}`)
// A backup that silently saved nothing is worse than no backup, because it
// looks like one.
if (saved === 0) { console.error('Nothing was saved. Treat this as a failure.'); process.exit(1) }
