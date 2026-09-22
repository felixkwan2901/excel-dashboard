#!/usr/bin/env node
// Give a job its checklist.
//
//   node scripts/set-field-job-type.mjs <jobNumber> <commercial|residential>
//   node scripts/set-field-job-type.mjs <jobNumber> none
//
// Nothing in the workbook says whether a job is commercial or residential, so
// this is the only place that decision is recorded. Until it is made the job
// appears in the field app with no tasks and says "not broken down yet",
// which is true — guessing the checklist would put the wrong twenty tasks in
// front of an electrician.
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
