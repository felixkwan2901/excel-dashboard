#!/usr/bin/env node
// Applies completed-job uploads staged by the upload worker's /completed-jobs
// route. Each upload is ONE bundle file, pending-updates/completed-jobs/<id>.json
// = { uploadedAt, files: [{ name, base64 }] } — the whole month arrives in a single
// commit, so a run never sees half a batch.
//
// For each bundle: unpack into a temp folder, load it exactly as
// `node scripts/add-completed-jobs.mjs <folder>` would, then
//   ok   → merge into public/completed-jobs.json, write
//          pending-updates/results/<id>.json (what the Update data page shows),
//          delete the bundle
//   fail → move the bundle to pending-updates/failed/<id>.json with a
//          <id>.json.error.json reason, which the page shows instead

import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { completedMonth, loadCompletedFolder, upsertCompletedJobs } from './lib/completed-job.mjs'

const STAGING = resolve('pending-updates/completed-jobs')
const FAILED = resolve('pending-updates/failed')
const RESULTS = resolve('pending-updates/results')
const OUT = resolve('public/completed-jobs.json')
// completedJobsUpdatedAt is its own time, so the pages can say when completed
// jobs last changed separately from the job data's updatedAt.
const SYNC_META = resolve('public/sync-meta.json')

const bundles = existsSync(STAGING) ? readdirSync(STAGING).filter((f) => f.endsWith('.json')).sort() : []
if (!bundles.length) { console.log('No pending completed-job uploads.'); process.exit(0) }

function fail(name, message) {
  mkdirSync(FAILED, { recursive: true })
  renameSync(join(STAGING, name), join(FAILED, name))
  writeFileSync(join(FAILED, `${name}.error.json`), JSON.stringify({ message }, null, 2) + '\n')
  console.log(`✗ ${name}: ${message}`)
}

for (const name of bundles) {
  let bundle
  try { bundle = JSON.parse(readFileSync(join(STAGING, name), 'utf8')) } catch { fail(name, 'The upload could not be read.'); continue }
  const tmp = mkdtempSync(join(tmpdir(), 'completed-'))
  try {
    for (const f of bundle.files ?? []) writeFileSync(join(tmp, basename(f.name)), Buffer.from(f.base64, 'base64'))
    const { records, skipped, problems, notes } = loadCompletedFolder(tmp)
    if (problems.length) { fail(name, 'The files and manifest.csv do not line up, so nothing was loaded: ' + problems.join(' · ')); continue }
    if (!records.length) { fail(name, 'No completed jobs could be read from these files. ' + skipped.map((s) => `${s.job}: ${s.reason}`).join(' · ')); continue }
    // the month picked on the Update data page (older bundles: the upload's month)
    const month = completedMonth(bundle.month, bundle.uploadedAt)
    for (const r of records) r.month = month
    const total = upsertCompletedJobs(OUT, records)
    mkdirSync(RESULTS, { recursive: true })
    writeFileSync(join(RESULTS, `${name}.json`), JSON.stringify({   // the path /status reads: results/<staged file name>.json
      kind: 'completed-jobs', loaded: records.length, total, month,
      jobs: records.map((r) => ({ jobNumber: r.jobNumber, jobName: r.jobName, type: r.type, gpPerHour: r.gpPerHour })),
      needsLook: skipped, notes,
    }, null, 2) + '\n')
    let meta = {}
    try { meta = JSON.parse(readFileSync(SYNC_META, 'utf8')) } catch { /* optional */ }
    meta.completedJobsUpdatedAt = new Date().toISOString()
    writeFileSync(SYNC_META, JSON.stringify(meta, null, 2) + '\n')
    rmSync(join(STAGING, name))
    console.log(`✓ ${name}: loaded ${records.length} job(s), ${skipped.length} to look at`)
  } catch (err) {
    fail(name, `Processing failed: ${err.message}`)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}
