#!/usr/bin/env node
// Applies staged archive/un-archive requests from
// pending-updates/archived-jobs/ — run by
// .github/workflows/process-pending-updates.yml.
//
// Deliberately doesn't touch the workbook at all — "archiving" a job just
// adds its number to public/archived-jobs.json, which the frontend filters
// every job-bearing view against (see loadWorkbook.js). The job's actual
// data stays completely untouched in every sheet — reversible, and no risk
// to any of the row-position-dependent formulas the other apply scripts
// have to be careful about.

import { readFileSync, writeFileSync, readdirSync, renameSync, mkdirSync, existsSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

const STAGING_DIR = resolve('pending-updates/archived-jobs')
const FAILED_DIR = resolve('pending-updates/failed')
const ARCHIVED_JOBS_PATH = resolve('public/archived-jobs.json')
const SYNC_META_PATH = resolve('sync-meta.json')

async function main() {
  if (!existsSync(STAGING_DIR)) {
    console.log('No pending archive/un-archive requests.')
    return
  }
  const files = readdirSync(STAGING_DIR).filter((f) => f.toLowerCase().endsWith('.json')).sort()
  if (files.length === 0) {
    console.log('No pending archive/un-archive requests.')
    return
  }

  console.log(`Found ${files.length} staged archive request(s)`)

  let archived = existsSync(ARCHIVED_JOBS_PATH) ? JSON.parse(readFileSync(ARCHIVED_JOBS_PATH, 'utf8')) : []
  let changed = false

  for (const name of files) {
    const path = join(STAGING_DIR, name)
    let batch
    try {
      batch = JSON.parse(readFileSync(path, 'utf8'))
    } catch (err) {
      console.log(`  ${name}: invalid JSON — moving to failed/`)
      mkdirSync(FAILED_DIR, { recursive: true })
      renameSync(path, join(FAILED_DIR, name))
      writeFileSync(join(FAILED_DIR, `${name}.error.json`), JSON.stringify({ message: `Invalid JSON: ${err.message}` }, null, 2))
      continue
    }

    const { jobNumber, action } = batch
    if (!jobNumber || (action !== 'archive' && action !== 'unarchive')) {
      console.log(`  ${name}: invalid request — moving to failed/`)
      mkdirSync(FAILED_DIR, { recursive: true })
      renameSync(path, join(FAILED_DIR, name))
      writeFileSync(join(FAILED_DIR, `${name}.error.json`), JSON.stringify({ message: 'Invalid job number or action.' }, null, 2))
      continue
    }

    const key = String(jobNumber)
    if (action === 'archive') {
      if (!archived.includes(key)) archived.push(key)
    } else {
      archived = archived.filter((n) => n !== key)
    }
    changed = true
    console.log(`  ${name}: ${action}d ${key}`)
    rmSync(path, { force: true })
  }

  if (changed) {
    writeFileSync(ARCHIVED_JOBS_PATH, JSON.stringify(archived, null, 2) + '\n')
    try {
      const meta = JSON.parse(readFileSync(SYNC_META_PATH, 'utf8'))
      meta.updatedAt = new Date().toISOString()
      writeFileSync(SYNC_META_PATH, JSON.stringify(meta, null, 2) + '\n')
    } catch {
      // sync-meta.json is optional
    }
  }
}

main()
