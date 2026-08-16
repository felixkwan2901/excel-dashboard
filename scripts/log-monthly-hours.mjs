#!/usr/bin/env node
// Snapshots each job's cumulative actual labour hours (from the Deliverables
// Sheet) into monthly-hours-log.json, keyed by the real-world calendar month
// this script happens to run in — not anything read from the workbook.
//
// The workbook only ever holds each job's cumulative hours-to-date; there's
// no month-by-month history anywhere in it (a monthly rollover clears the
// week slots but doesn't record what the prior month's total was). Hours
// worked in a given month has to be derived from the DIFFERENCE between two
// cumulative snapshots — so this log just records "cumulative hours as of
// the last time this script ran in month X", overwriting that same month's
// entry on every run within it. The frontend computes each month's actual
// hours worked as (this month's cumulative − previous month's cumulative).
//
// Run this after update-jobs.mjs / apply-replace.mjs, whenever the workbook
// has just been refreshed with new figures — see
// .github/workflows/process-pending-updates.yml.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import ExcelJS from 'exceljs'

const workbookPath = resolve('Cassidy_Davies_Electrical_BPMN_Data.xlsx')
// Lives in public/ (not bundled via a JS import) — Vite's JSON handling
// doesn't emit a `?url` import of a .json file as a fetchable static asset
// the way it does for other file types, so this rides the same
// copied-as-is mechanism the PWA icons already use.
const logPath = resolve('public/monthly-hours-log.json')

function resolveCellValue(v) {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') {
    if ('error' in v) return ''
    if ('result' in v) {
      const r = v.result
      if (r && typeof r === 'object' && 'error' in r) return ''
      return r ?? ''
    }
    if ('richText' in v) return v.richText.map((t) => t.text).join('')
  }
  return v
}

function worksheetToRows(worksheet) {
  const rows = []
  const colCount = Math.max(worksheet.columnCount, 30)
  for (let r = 1; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r)
    const arr = []
    for (let c = 1; c <= colCount; c++) {
      arr[c - 1] = resolveCellValue(row.getCell(c).value)
    }
    rows[r - 1] = arr
  }
  return rows
}

function normalizeHeader(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
}

// Same disambiguation as update-jobs.mjs — several sheets share a "Job
// Number" first column, only the real Deliverables Sheet also has these
// cost columns.
function findDeliverablesSheet(workbook) {
  const candidates = []
  for (const worksheet of workbook.worksheets) {
    const rows = worksheetToRows(worksheet)
    const headerIdx = rows.findIndex((r) => normalizeHeader(r[0]) === 'job number')
    if (headerIdx === -1) continue
    const header = rows[headerIdx].map(normalizeHeader)
    if (!header.includes('quoted price') || !header.includes('total actual cost')) continue
    candidates.push({ worksheet, rows, headerIdx })
  }
  const preferred = candidates.find((c) => !c.worksheet.name.toLowerCase().includes('test'))
  const chosen = preferred ?? candidates[0]
  if (!chosen) throw new Error('Could not find the Deliverables Sheet')
  return chosen
}

function buildJobBlocks(rows, headerIdx) {
  const blocks = []
  let current = null
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const label = rows[i][2]
    if (label === 'Start of month') {
      if (current) blocks.push(current)
      current = { startIdx: i, jobNumber: rows[i][0], jobName: rows[i][1], weekIdxs: [i] }
    } else if (current && typeof label === 'string' && label.startsWith('Week')) {
      current.weekIdxs.push(i)
    }
  }
  if (current) blocks.push(current)
  return blocks
}

const COL_QUOTED_PRICE = 3
const COL_ACTUAL_LABOUR_HOURS = 19

// The row with the most recent data in the block — same "last filled week,
// falling back to Start of month" rule update-jobs.mjs uses to find where
// to write the NEXT update, except here we just want to READ the latest.
function pickCurrentRowIdx(block, rows) {
  let lastFilledPos = 0
  for (let i = block.weekIdxs.length - 1; i >= 0; i--) {
    const qp = Number(rows[block.weekIdxs[i]][COL_QUOTED_PRICE])
    if (Number.isFinite(qp) && qp > 0) {
      lastFilledPos = i
      break
    }
  }
  return block.weekIdxs[lastFilledPos]
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

async function main() {
  if (!existsSync(workbookPath)) {
    console.log('Workbook not found — nothing to log.')
    return
  }

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(workbookPath)
  const { rows, headerIdx } = findDeliverablesSheet(wb)
  const blocks = buildJobBlocks(rows, headerIdx)
  const isValidJobBlock = (b) => Number(b.jobNumber) > 0 && String(b.jobName ?? '').trim() !== '' && String(b.jobName).trim() !== '0'

  const log = existsSync(logPath) ? JSON.parse(readFileSync(logPath, 'utf8')) : {}
  const month = monthKey(new Date())
  const snapshot = {}

  for (const block of blocks.filter(isValidJobBlock)) {
    const currentIdx = pickCurrentRowIdx(block, rows)
    const cumulativeHours = Number(rows[currentIdx][COL_ACTUAL_LABOUR_HOURS])
    if (!Number.isFinite(cumulativeHours)) continue
    snapshot[String(block.jobNumber)] = { jobName: String(block.jobName), cumulativeHours }
  }

  log[month] = snapshot
  writeFileSync(logPath, JSON.stringify(log, null, 2) + '\n')
  console.log(`Logged ${Object.keys(snapshot).length} job(s) of cumulative hours for ${month} to ${logPath}`)
}

main()
