#!/usr/bin/env node
// Applies staged Job checklist edits from pending-updates/main-sheet/ — run
// by .github/workflows/process-pending-updates.yml after the upload-worker's
// /main-sheet endpoint stages each edit request there (the worker itself no
// longer touches ExcelJS, to stay clear of Cloudflare Workers' free-plan
// CPU-time limit).
//
// Each staged file is one save action from the dashboard: { edits: [{
// jobNumber, col, value }] }. Applied in filename (chronological) order, so
// if the same cell was changed twice before this ran, the later edit wins.
// A file whose edits don't match any job in the current workbook is moved
// to pending-updates/failed/ with a sibling .error.json; a file with only
// some unmatched edits still applies what it can and is deleted normally
// (unmatched jobs are just logged, not treated as a failure).

import { readFileSync, writeFileSync, readdirSync, renameSync, mkdirSync, existsSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import ExcelJS from 'exceljs'

const STAGING_DIR = resolve('pending-updates/main-sheet')
const FAILED_DIR = resolve('pending-updates/failed')
const WORKBOOK_PATH = resolve('Cassidy_Davies_Electrical_BPMN_Data.xlsx')
const SYNC_META_PATH = resolve('sync-meta.json')

async function main() {
  if (!existsSync(STAGING_DIR)) {
    console.log('No pending checklist edits.')
    return
  }
  const files = readdirSync(STAGING_DIR).filter((f) => f.toLowerCase().endsWith('.json')).sort()
  if (files.length === 0) {
    console.log('No pending checklist edits.')
    return
  }

  console.log(`Found ${files.length} staged edit batch(es)`)

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(WORKBOOK_PATH)
  const ws = wb.getWorksheet('Main Sheet')
  if (!ws) throw new Error('Could not find "Main Sheet" in the current workbook')

  const jobRowByNumber = new Map()
  ws.eachRow((row, rowNumber) => {
    const jobNumRaw = row.getCell(1).value
    const jobNum = jobNumRaw && typeof jobNumRaw === 'object' ? jobNumRaw.result : jobNumRaw
    if (typeof jobNum === 'number' && jobNum > 0) jobRowByNumber.set(String(jobNum), rowNumber)
  })

  let totalApplied = 0
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

    const edits = Array.isArray(batch.edits) ? batch.edits : []
    if (edits.length === 0) {
      console.log(`  ${name}: no edits — discarding`)
      processedFiles.push(path)
      continue
    }

    let appliedInFile = 0
    const notFound = []
    for (const edit of edits) {
      const rowNumber = jobRowByNumber.get(String(edit.jobNumber))
      const col = Number(edit.col)
      if (!rowNumber || !Number.isInteger(col) || col < 0) {
        notFound.push(edit.jobNumber)
        continue
      }
      ws.getRow(rowNumber).getCell(col + 1).value = String(edit.value ?? '')
      appliedInFile++
      totalApplied++
    }

    if (appliedInFile === 0) {
      console.log(`  ${name}: none of ${edits.length} edit(s) matched a job — moving to failed/`)
      mkdirSync(FAILED_DIR, { recursive: true })
      renameSync(path, join(FAILED_DIR, name))
      writeFileSync(join(FAILED_DIR, `${name}.error.json`), JSON.stringify({ message: `No matching job for: ${notFound.join(', ')}` }, null, 2))
      continue
    }

    console.log(`  ${name}: applied ${appliedInFile}/${edits.length} edit(s)${notFound.length ? ` (unmatched: ${notFound.join(', ')})` : ''}`)
    processedFiles.push(path)
  }

  if (totalApplied > 0) {
    await wb.xlsx.writeFile(WORKBOOK_PATH)
    try {
      const meta = JSON.parse(readFileSync(SYNC_META_PATH, 'utf8'))
      meta.updatedAt = new Date().toISOString()
      writeFileSync(SYNC_META_PATH, JSON.stringify(meta, null, 2) + '\n')
    } catch {
      // sync-meta.json is optional
    }
  }

  // Only remove staged files for batches that were actually processed
  // (fully or partially applied, or empty) — failed ones were already
  // moved to pending-updates/failed/ above.
  for (const path of processedFiles) rmSync(path, { force: true })

  console.log(`Applied ${totalApplied} total edit(s) across ${processedFiles.length} batch(es).`)
}

main()
