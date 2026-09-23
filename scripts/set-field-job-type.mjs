#!/usr/bin/env node
// Give a job its checklist.
//
//   node scripts/set-field-job-type.mjs <jobNumber> <commercial|residential>
//   node scripts/set-field-job-type.mjs <jobNumber> none
//
// You almost certainly do not need this any more.
//
// The checklist now comes from the type of work set on the dashboard's
// Projects tab — Commercial New Build and the rest map to commercial or
// residential, and publish-field-jobs.mjs applies that. Set it there and it
// flows through on the next publish.
//
// This remains for the one case the mapping cannot answer: a category that is
// neither a commercial nor a residential build (Warranty, Design, Solar and
// so on) but which still needs a checklist. Anything set here is overwritten
// the moment the job's category does map, because one source of truth beats
// two that can disagree.
import { execFileSync } from 'node:child_process'

const KEY = 'planning:field-jobs'
const NS = '1bed6e14dbf047ac8616ae21ed09a9f6'
const TYPES = new Set(['commercial', 'residential'])

const [jobNumber, type] = process.argv.slice(2)
if (!jobNumber || !type) {
  console.error('usage: set-field-job-type.mjs <jobNumber> <commercial|residential|none>')
  process.exit(64)
}
if (!TYPES.has(type) && type !== 'none') {
  console.error(`Type must be commercial, residential or none — not "${type}"`)
  process.exit(65)
}

const wrangler = (args) =>
  execFileSync('npx', ['wrangler', ...args], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] })

let jobs
try {
  jobs = JSON.parse(wrangler(['kv', 'key', 'get', KEY, '--namespace-id', NS, '--remote']))
} catch {
  console.error(`No ${KEY} yet. Run: node scripts/publish-field-jobs.mjs`)
  process.exit(66)
}

const job = jobs.find((j) => String(j.jobNumber) === String(jobNumber))
if (!job) {
  console.error(`Job ${jobNumber} is not in the published list.`)
  process.exit(66)
}

if (type === 'none') delete job.type
else job.type = type

wrangler(['kv', 'key', 'put', KEY, JSON.stringify(jobs), '--namespace-id', NS, '--remote'])
console.log(type === 'none'
  ? `${jobNumber} (${job.jobName}) has no checklist now.`
  : `${jobNumber} (${job.jobName}) now uses the ${type} checklist.`)
