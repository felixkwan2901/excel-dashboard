#!/usr/bin/env node
// Applies staged Upcoming Work Calculator edits from
// pending-updates/upcoming-work/ — run by
// .github/workflows/process-pending-updates.yml after the upload-worker's
// /upcoming-work endpoint stages each edit there.
//
// Each staged file is one save action: { edits: [{ jobNumber, col, value }]
// }, where `col` is a 0-indexed column on "Upcoming Work Calculator". Only
// ever writes to the sheet's plain manual-entry columns (Jan-Dec hours
// allocation, cols 5-16, and the notes column, 18) — identity (cols 0/1)
// and Quoted/Used/Remaining hours (cols 2/3/4) are live formulas and this
// script never touches them. Applied in filename (chronological) order,
// same "later edit wins" rule the other apply scripts use.

import { readFileSync, writeFileSync, readdirSync, renameSync, mkdirSync, existsSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import ExcelJS from 'exceljs'

const STAGING_DIR = resolve('pending-updates/upcoming-work')
const FAILED_DIR = resolve('pending-updates/failed')
const WORKBOOK_PATH = resolve('public/Cassidy_Davies_Electrical_BPMN_Data.xlsx')
const SYNC_META_PATH = resolve('sync-meta.json')

const NOTES_COL = 18
const EDITABLE_COLUMNS = new Set([5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, NOTES_COL])

async function main() {
  if (!existsSync(STAGING_DIR)) {
    console.log('No pending Upcoming Work edits.')
    return
  }
  const files = readdirSync(STAGING_DIR).filter((f) => f.toLowerCase().endsWith('.json')).sort()
  if (files.length === 0) {
    console.log('No pending Upcoming Work edits.')
    return
  }

  console.log(`Found ${files.length} staged edit batch(es)`)

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(WORKBOOK_PATH)
  const ws = wb.getWorksheet('Upcoming Work Calculator')
  if (!ws) throw new Error('Could not find "Upcoming Work Calculator" in the current workbook')

  // Job Number (col A) is a formula (`='Main Sheet'!A<n>'`) on this sheet
  // too — match by its cached result, same approach the other apply
  // scripts use.
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
    const rejected = []
    for (const edit of edits) {
      const rowNumber = jobRowByNumber.get(String(edit.jobNumber))
      const col = Number(edit.col)
      if (!rowNumber || !EDITABLE_COLUMNS.has(col)) {
        rejected.push(`${edit.jobNumber} (col ${edit.col})`)
        continue
      }
      const value = col === NOTES_COL ? String(edit.value ?? '') : Number(edit.value)
      if (col !== NOTES_COL && !Number.isFinite(value)) {
        rejected.push(`${edit.jobNumber} (col ${edit.col}, not a number)`)
        continue
      }
      ws.getRow(rowNumber).getCell(col + 1).value = value
      appliedInFile++
      totalApplied++
    }

    if (appliedInFile === 0) {
      console.log(`  ${name}: none of ${edits.length} edit(s) applied — moving to failed/`)
      mkdirSync(FAILED_DIR, { recursive: true })
      renameSync(path, join(FAILED_DIR, name))
      writeFileSync(join(FAILED_DIR, `${name}.error.json`), JSON.stringify({ message: `Rejected: ${rejected.join(', ')}` }, null, 2))
      continue
    }

    console.log(`  ${name}: applied ${appliedInFile}/${edits.length} edit(s)${rejected.length ? ` (rejected: ${rejected.join(', ')})` : ''}`)
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

  for (const path of processedFiles) rmSync(path, { force: true })

  console.log(`Applied ${totalApplied} total edit(s) across ${processedFiles.length} batch(es).`)
}

main()
