#!/usr/bin/env node
// Applies staged Notes edits from pending-updates/notes/ — run by
// .github/workflows/process-pending-updates.yml after the upload-worker's
// /notes endpoint stages each save there.
//
// "Note Cam (To Do)" / "Note Tom (To Do)" are free-text running notes, one
// line of text per row, each row merged across the full sheet width in the
// source file (A:AB). A staged edit is the WHOLE text for one person,
// applied in filename (chronological) order — the same "later edit wins"
// rule the checklist's apply script uses.

import { readFileSync, writeFileSync, readdirSync, renameSync, mkdirSync, existsSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import ExcelJS from 'exceljs'

const STAGING_DIR = resolve('pending-updates/notes')
const FAILED_DIR = resolve('pending-updates/failed')
const WORKBOOK_PATH = resolve('Cassidy_Davies_Electrical_BPMN_Data.xlsx')
const SYNC_META_PATH = resolve('sync-meta.json')

const SHEET_NAMES = { cam: 'Note Cam (To Do)', tom: 'Note Tom (To Do)' }

// A couple of these sheet names carry a trailing space in the actual file
// ("Note Tom (To Do) ") — look them up by trimmed, case-insensitive name so
// that kind of thing doesn't silently break the write.
function findWorksheet(workbook, name) {
  const target = name.trim().toLowerCase()
  return workbook.worksheets.find((ws) => ws.name.trim().toLowerCase() === target)
}

// Writes `text` (one line per row) into the sheet starting at row 1,
// growing the sheet (duplicating its own last row, which carries the
// existing full-width merge and styling) if there are more lines than
// existing rows, and blanking out any leftover rows if there are fewer.
function writeNotesSheet(worksheet, text) {
  const lines = text.split('\n')
  while (worksheet.rowCount < lines.length) {
    worksheet.duplicateRow(worksheet.rowCount, 1, true)
  }
  for (let r = 1; r <= worksheet.rowCount; r++) {
    worksheet.getRow(r).getCell(1).value = lines[r - 1] ?? ''
  }
}

async function main() {
  if (!existsSync(STAGING_DIR)) {
    console.log('No pending notes edits.')
    return
  }
  const files = readdirSync(STAGING_DIR).filter((f) => f.toLowerCase().endsWith('.json')).sort()
  if (files.length === 0) {
    console.log('No pending notes edits.')
    return
  }

  console.log(`Found ${files.length} staged note edit(s)`)

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(WORKBOOK_PATH)

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

    const { person, text } = batch
    const sheetName = SHEET_NAMES[person]
    if (!sheetName || typeof text !== 'string') {
      console.log(`  ${name}: invalid person/text — moving to failed/`)
      mkdirSync(FAILED_DIR, { recursive: true })
      renameSync(path, join(FAILED_DIR, name))
      writeFileSync(join(FAILED_DIR, `${name}.error.json`), JSON.stringify({ message: `Invalid person "${person}" or missing text.` }, null, 2))
      continue
    }

    const worksheet = findWorksheet(wb, sheetName)
    if (!worksheet) {
      console.log(`  ${name}: could not find "${sheetName}" — moving to failed/`)
      mkdirSync(FAILED_DIR, { recursive: true })
      renameSync(path, join(FAILED_DIR, name))
      writeFileSync(join(FAILED_DIR, `${name}.error.json`), JSON.stringify({ message: `Could not find sheet "${sheetName}" in the current workbook.` }, null, 2))
      continue
    }

    writeNotesSheet(worksheet, text)
    totalApplied++
    console.log(`  ${name}: applied (${person})`)
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

  console.log(`Applied ${totalApplied} note edit(s).`)
}

main()
