#!/usr/bin/env node
// Applies staged to-do list edits from pending-updates/todos/ — run by
// .github/workflows/process-pending-updates.yml after the upload-worker's
// /todos endpoint stages each save there.
//
// Doesn't touch the Excel workbook at all — to-dos are per-person, and an
// arbitrary/growing set of people doesn't map onto a fixed number of
// Excel sheets the way the old Cam/Tom-only design did. Each staged batch
// is the WHOLE to-do list (every person, every item) at the moment
// someone made a change; applied in filename (chronological) order, so
// the latest batch simply overwrites public/todos.json.

import { readFileSync, writeFileSync, readdirSync, renameSync, mkdirSync, existsSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

const STAGING_DIR = resolve('pending-updates/todos')
const FAILED_DIR = resolve('pending-updates/failed')
const TODOS_PATH = resolve('public/todos.json')
const SYNC_META_PATH = resolve('sync-meta.json')

async function main() {
  if (!existsSync(STAGING_DIR)) {
    console.log('No pending to-do edits.')
    return
  }
  const files = readdirSync(STAGING_DIR).filter((f) => f.toLowerCase().endsWith('.json')).sort()
  if (files.length === 0) {
    console.log('No pending to-do edits.')
    return
  }

  console.log(`Found ${files.length} staged to-do edit(s)`)

  let latestTodos = null
  const processedFiles = []

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

    if (!Array.isArray(batch.todos)) {
      console.log(`  ${name}: missing todos array — moving to failed/`)
      mkdirSync(FAILED_DIR, { recursive: true })
      renameSync(path, join(FAILED_DIR, name))
      writeFileSync(join(FAILED_DIR, `${name}.error.json`), JSON.stringify({ message: 'Staged batch had no todos array.' }, null, 2))
      continue
    }

    latestTodos = batch.todos // later files sort later — the last one wins
    console.log(`  ${name}: applied (${batch.todos.length} item(s))`)
    processedFiles.push(path)
  }

  if (latestTodos !== null) {
    writeFileSync(TODOS_PATH, JSON.stringify(latestTodos, null, 2) + '\n')
    try {
      const meta = JSON.parse(readFileSync(SYNC_META_PATH, 'utf8'))
      meta.updatedAt = new Date().toISOString()
      writeFileSync(SYNC_META_PATH, JSON.stringify(meta, null, 2) + '\n')
    } catch {
      // sync-meta.json is optional
    }
  }

  for (const path of processedFiles) rmSync(path, { force: true })
}

main()
