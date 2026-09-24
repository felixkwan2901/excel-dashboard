#!/usr/bin/env node
// Adds one completed job's GP/hour to public/completed-jobs.json, which the
// dashboard's "Completed jobs" tab reads.
//
// Usage:
//   node scripts/add-completed-job.mjs <ProfitAndLoss export.xlsx> [Timesheet export.xlsx] [options]
//
// Two job types, detected from the export's own sheet names:
//
//   Quoted   ("Quotes" sheet present) — job number/name come from the
//            Quotes sheet. Profit is the Summary sheet's Quoted Profit
//            (Total row). Actual hours default to the Budgeted sheet's
//            Labour "Actual Quantity" (an aggregate, no worker names) — pass
//            a Timesheet export as the second argument to get a real
//            per-worker breakdown instead (and a total that matches it).
//
//   Charge-up ("Sold"/"Unsold" sheets, no "Quotes" sheet) — these exports
//            carry no job number or name at all, so pass --job-number and
//            --job-name yourself. Profit is the Summary sheet's Total
//            profit (Actual Sell − Actual Cost, which already nets out
//            Unsold's write-off cost). Hours are Sold-sheet Labour hours
//            only (billed hours) — Unsold hours were worked but written
//            off, and aren't counted as "hours this profit was earned
//            over".
//
// GP/hour = profit ÷ total hours, for both types — a single job-level rate,
// not a per-worker split (splitting profit proportionally to each worker's
// hours produces the same per-hour rate for everyone anyway, so there is
// nothing to be gained by fragmenting it. Worker hours are still recorded
// per job so the total can be sanity-checked or an individual's hours seen).
//
// Options:
//   --job-number=1234       required for a charge-up export
//   --job-name="..."        required for a charge-up export
//   --dry-run               compute and print, but don't write the file
//
// Run with no options against the real export to add it for real; run with
// --dry-run first if you just want to sanity-check the numbers.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import XLSX from 'xlsx'

// XLSX.readFile relies on the package detecting Node's `fs` itself, which
// its ESM build doesn't do (only the CJS build does) — it fails with an
// opaque "Cannot access file" even though the file plainly exists. Reading
// the buffer ourselves and handing it to XLSX.read() sidesteps that.
function readWorkbook(path) {
  return XLSX.read(readFileSync(path), { type: 'buffer' })
}

const args = process.argv.slice(2)
const positional = args.filter((a) => !a.startsWith('--'))
const flags = Object.fromEntries(
  args
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [key, ...rest] = a.slice(2).split('=')
      return [key, rest.length ? rest.join('=') : true]
    })
)

const plPath = positional[0]
const timesheetPath = positional[1]
const dryRun = Boolean(flags['dry-run'])
const outPath = resolve('public/completed-jobs.json')

if (!plPath) {
  console.error('Usage: node scripts/add-completed-job.mjs <ProfitAndLoss export.xlsx> [Timesheet export.xlsx] [--job-number=1234] [--job-name="..."] [--dry-run]')
  process.exit(1)
}

function sheetRows(workbook, name) {
  const sheet = workbook.Sheets[name]
  if (!sheet) return null
  return XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' })
}

// Cells come back as formatted strings like "$172.78" or "27.13%" (raw:
// false elsewhere in this codebase's readers) — strip everything but the
// numeric core.
function toNumber(v) {
  if (typeof v === 'number') return v
  const n = Number(String(v ?? '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

function readQuotedJob(workbook) {
  const quotes = sheetRows(workbook, 'Quotes')
  const summary = sheetRows(workbook, 'Summary')
  const budgeted = sheetRows(workbook, 'Budgeted')
  if (!quotes || !summary) throw new Error('Quoted job export is missing its Quotes or Summary sheet.')

  const quoteHeaderIdx = quotes.findIndex((r) => r[0] === 'Quote Number')
  const quoteRow = quotes[quoteHeaderIdx + 1]
  if (!quoteRow) throw new Error('Could not find a quote row on the Quotes sheet.')
  const jobNumber = String(quoteRow[0]).trim()
  const jobName = String(quoteRow[1] ?? '').trim()

  const totalRow = summary.find((r) => r[0] === 'Total')
  if (!totalRow) throw new Error('Could not find the Total row on the Summary sheet.')
  // Category,Quoted Cost,Actual Cost,Quoted Sell,,Quoted Profit,,Quoted Margin
  const profit = toNumber(totalRow[5])
  if (profit === null) throw new Error('Could not read Quoted Profit from the Summary sheet Total row.')

  // Fallback aggregate hours, used only if no timesheet export is given —
  // no worker names, just the total actual quantity logged against Labour.
  let hours = null
  if (budgeted) {
    const labourRow = budgeted.find((r) => r[1] === 'Timesheet' && r[2] === 'Labour')
    if (labourRow) hours = toNumber(labourRow[4])
  }

  let workers = null
  if (timesheetPath) {
    workers = readTimesheetWorkers(timesheetPath)
    hours = workers.reduce((sum, w) => sum + w.hours, 0)
  }

  if (hours === null || hours <= 0) {
    throw new Error('Could not determine actual hours for this quoted job (no Budgeted Labour row and no timesheet given).')
  }

  return { jobNumber, jobName, type: 'quoted', profit, hours, workers }
}

function readTimesheetWorkers(path) {
  const workbook = readWorkbook(path)
  const rows = sheetRows(workbook, 'Data')
  if (!rows) throw new Error('Timesheet export is missing its Data sheet.')

  const headerIdx = rows.findIndex((r) => r[0] === 'Code')
  const byWorker = new Map()
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    const name = String(row[1] ?? '').trim()
    if (!name || name === 'Total') continue
    const quantity = toNumber(row[6])
    if (quantity === null) continue
    byWorker.set(name, (byWorker.get(name) ?? 0) + quantity)
  }
  if (byWorker.size === 0) throw new Error('Found no worker hours on the Timesheet export.')
  return [...byWorker.entries()].map(([name, hours]) => ({ name, hours }))
}

function readChargeUpJob(workbook) {
  const summary = sheetRows(workbook, 'Summary')
  const sold = sheetRows(workbook, 'Sold')
  if (!summary || !sold) throw new Error('Charge-up export is missing its Summary or Sold sheet.')

  const totalRow = summary.find((r) => r[0] === 'Total')
  if (!totalRow) throw new Error('Could not find the Total row on the Summary sheet.')
  // Category,Actual Cost,Actual Sell,Profit,Margin
  const profit = toNumber(totalRow[3])
  if (profit === null) throw new Error('Could not read Profit from the Summary sheet Total row.')

  // Labour rows on the Sold sheet only — billed hours, not the Unsold
  // (written-off) ones. Rows sit between the "Product Category: Labour"
  // marker and its own "Total: Product Category: Labour" row.
  const labourStart = sold.findIndex((r) => r[0] === 'Product Category: Labour')
  if (labourStart === -1) throw new Error('Sold sheet has no Labour category — nothing to compute hours from.')
  const workers = []
  for (let i = labourStart + 1; i < sold.length; i++) {
    const row = sold[i]
    if (typeof row[0] === 'string' && row[0].startsWith('Total: Product Category')) break
    const name = String(row[2] ?? '').trim()
    const quantity = toNumber(row[6])
    if (!name || quantity === null) continue
    workers.push({ name, hours: quantity })
  }
  if (workers.length === 0) throw new Error('Found no billed Labour hours on the Sold sheet.')
  const hours = workers.reduce((sum, w) => sum + w.hours, 0)

  const jobNumber = flags['job-number'] ? String(flags['job-number']).trim() : null
  const jobName = flags['job-name'] ? String(flags['job-name']).trim() : null
  if (!jobNumber || !jobName) {
    throw new Error(
      'This is a charge-up export — it has no job number or name in it. Pass --job-number=1234 and --job-name="..." yourself.'
    )
  }

  return { jobNumber, jobName, type: 'chargeup', profit, hours, workers }
}

const workbook = readWorkbook(plPath)
const isQuoted = workbook.SheetNames.includes('Quotes')
const isChargeUp = workbook.SheetNames.includes('Sold')

if (!isQuoted && !isChargeUp) {
  console.error(`Don't recognise this export's sheets (${workbook.SheetNames.join(', ')}) as either a quoted or charge-up P&L export.`)
  process.exit(1)
}

const result = isQuoted ? readQuotedJob(workbook) : readChargeUpJob(workbook)
const gpPerHour = Math.round((result.profit / result.hours) * 100) / 100

const record = {
  jobNumber: result.jobNumber,
  jobName: result.jobName,
  type: result.type,
  profit: result.profit,
  hours: Math.round(result.hours * 100) / 100,
  gpPerHour,
  workers: result.workers,
  addedAt: new Date().toISOString().slice(0, 10),
  sourceFile: basename(plPath),
}

console.log(JSON.stringify(record, null, 2))

if (dryRun) {
  console.log('\n(--dry-run — nothing written)')
  process.exit(0)
}

const existing = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : []
const withoutThisJob = existing.filter((j) => j.jobNumber !== record.jobNumber)
withoutThisJob.push(record)
writeFileSync(outPath, JSON.stringify(withoutThisJob, null, 2) + '\n')
console.log(`\nWrote ${outPath} (${withoutThisJob.length} completed job${withoutThisJob.length === 1 ? '' : 's'} total).`)
