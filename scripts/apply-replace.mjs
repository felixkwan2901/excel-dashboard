#!/usr/bin/env node
// Applies a staged "replace the whole workbook" request from
// pending-updates/replace/ — run by .github/workflows/process-pending-updates.yml
// after the upload-worker's /replace endpoint stages the uploaded file there
// (the worker itself no longer touches ExcelJS at all, to stay clear of
// Cloudflare Workers' free-plan CPU-time limit).
//
// For each staged file (oldest first): validate it still looks like the
// right kind of workbook (has the Deliverables Sheet), and if so, it
// becomes the new live workbook. An invalid file is moved to
// pending-updates/failed/ with a sibling .error.json explaining why,
// rather than silently dropped.
//
// Exits non-zero (and commits nothing) only if something unexpected goes
// wrong — an invalid upload is a normal, handled outcome, not a crash.

import { readFileSync, writeFileSync, readdirSync, renameSync, mkdirSync, existsSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import ExcelJS from 'exceljs'

const STAGING_DIR = resolve('pending-updates/replace')
const FAILED_DIR = resolve('pending-updates/failed')
const WORKBOOK_PATH = resolve('public/Cassidy_Davies_Electrical_BPMN_Data.xlsx')
const SYNC_META_PATH = resolve('sync-meta.json')

function normalizeHeader(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function worksheetToRows(worksheet) {
  const rows = []
  const colCount = Math.max(worksheet.columnCount, 30)
  for (let r = 1; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r)
    const arr = []
    for (let c = 1; c <= colCount; c++) {
      const v = row.getCell(c).value
      arr[c - 1] = v && typeof v === 'object' ? (v.result ?? '') : (v ?? '')
    }
    rows[r - 1] = arr
  }
  return rows
}

async function validateWorkbook(buffer) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  for (const worksheet of wb.worksheets) {
    const rows = worksheetToRows(worksheet)
    const headerIdx = rows.findIndex((r) => normalizeHeader(r[0]) === 'job number')
    if (headerIdx === -1) continue
    const header = rows[headerIdx].map(normalizeHeader)
    if (header.includes('quoted price') && header.includes('total actual cost')) return true
  }
  return false
}

async function main() {
  if (!existsSync(STAGING_DIR)) {
    console.log('No pending replace requests.')
    return
  }
  const files = readdirSync(STAGING_DIR).filter((f) => f.toLowerCase().endsWith('.xlsx')).sort()
  if (files.length === 0) {
    console.log('No pending replace requests.')
    return
  }

  console.log(`Found ${files.length} staged replace request(s)`)
  let appliedCount = 0

  for (const name of files) {
    const path = join(STAGING_DIR, name)
    const buffer = readFileSync(path)

    let valid = false
    try {
      valid = await validateWorkbook(buffer)
    } catch (err) {
      console.log(`  ${name}: could not be read (${err.message}) — moving to failed/`)
      mkdirSync(FAILED_DIR, { recursive: true })
      renameSync(path, join(FAILED_DIR, name))
      writeFileSync(join(FAILED_DIR, `${name}.error.json`), JSON.stringify({ message: `Could not be read: ${err.message}` }, null, 2))
      continue
    }

    if (!valid) {
      console.log(`  ${name}: doesn't look like a valid workbook — moving to failed/`)
      mkdirSync(FAILED_DIR, { recursive: true })
      renameSync(path, join(FAILED_DIR, name))
      writeFileSync(
        join(FAILED_DIR, `${name}.error.json`),
        JSON.stringify({ message: 'No sheet found with Job Number + Quoted Price + Total actual cost columns.' }, null, 2)
      )
      continue
    }

    console.log(`  ${name}: valid — replacing the live workbook`)
    writeFileSync(WORKBOOK_PATH, buffer)
    rmSync(path)
    appliedCount++
  }

  if (appliedCount > 0) {
    try {
      const meta = JSON.parse(readFileSync(SYNC_META_PATH, 'utf8'))
      meta.updatedAt = new Date().toISOString()
      writeFileSync(SYNC_META_PATH, JSON.stringify(meta, null, 2) + '\n')
    } catch {
      // sync-meta.json is optional
    }
  }

  console.log(`Applied ${appliedCount} of ${files.length} replace request(s).`)
}

main()
