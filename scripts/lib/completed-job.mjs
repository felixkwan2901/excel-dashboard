// Parsing for completed-job P&L exports, shared by add-completed-job.mjs (one job)
// and add-completed-jobs.mjs (a folder of them). Everything is LABOUR only:
//
//   Quoted    ("Quotes" sheet) — labour profit = the Summary sheet's Labour Quoted
//             Cost − Labour Actual Cost; hours come from the job's Timesheets export
//             when given (per worker), otherwise the Budgeted sheet's Labour
//             "Actual Quantity". Quoted hours = the Budgeted Labour "Quoted Quantity".
//   Charge-up ("Sold"/"Unsold", no "Quotes") — labour profit = the Summary sheet's
//             Labour Actual Sell − Labour Actual Cost. Actual hours = the Sold sheet's
//             labour lines (per person); quoted hours = Sold + Unsold labour, so with
//             no Unsold hours quoted = actual (done within the time).
//             These exports carry no job number or name, so the caller supplies them.
//
// GP/hour = labour profit ÷ actual hours, for both types; each person's part is that
// GP/hour × their own hours. quotedHours − hours is shown alongside.

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import XLSX from 'xlsx'

// XLSX.readFile relies on the package detecting Node's `fs` itself, which its ESM
// build doesn't do — it fails with an opaque "Cannot access file". Reading the
// buffer ourselves sidesteps that.
export function readWorkbook(path) {
  return XLSX.read(readFileSync(path), { type: 'buffer' })
}

export function sheetRows(workbook, name) {
  const sheet = workbook.Sheets[name]
  return sheet ? XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' }) : null
}

// Cells arrive as formatted strings like "$172.78" or "27.13%".
function toNumber(v) {
  if (typeof v === 'number') return v
  const n = Number(String(v ?? '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

export function exportKind(workbook) {
  if (workbook.SheetNames.includes('Quotes')) return 'quoted'
  if (workbook.SheetNames.includes('Sold')) return 'chargeup'
  return null
}

export function readTimesheetWorkers(workbook) {
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

export function parseQuoted(workbook, timesheetWorkbook = null) {
  const quotes = sheetRows(workbook, 'Quotes')
  const summary = sheetRows(workbook, 'Summary')
  const budgeted = sheetRows(workbook, 'Budgeted')
  if (!quotes || !summary) throw new Error('Quoted job export is missing its Quotes or Summary sheet.')

  const quoteRow = quotes[quotes.findIndex((r) => r[0] === 'Quote Number') + 1]
  if (!quoteRow) throw new Error('Could not find a quote row on the Quotes sheet.')
  const jobNumber = String(quoteRow[0]).trim()
  const jobName = String(quoteRow[1] ?? '').trim()

  // Category,Quoted Cost,Actual Cost,Quoted Sell,,Quoted Profit,,Quoted Margin
  const labour = summary.find((r) => r[0] === 'Labour')
  const quotedCost = toNumber(labour?.[1]), actualCost = toNumber(labour?.[2])
  if (quotedCost === null || actualCost === null) throw new Error('Could not read the Labour Quoted/Actual Cost on the Summary sheet.')
  const profit = quotedCost - actualCost

  let hours = null, workers = null, hoursSource = 'budgeted', quotedHours = null
  if (budgeted) {
    // Code,Source,Description,Actual Cost,Actual Quantity,Quoted Cost,Quoted Quantity,…
    const labourRow = budgeted.find((r) => r[1] === 'Timesheet' && r[2] === 'Labour')
    if (labourRow) { hours = toNumber(labourRow[4]); quotedHours = toNumber(labourRow[6]) }
  }
  if (timesheetWorkbook) {
    workers = readTimesheetWorkers(timesheetWorkbook)
    hours = workers.reduce((sum, w) => sum + w.hours, 0)
    hoursSource = 'timesheet'
  }
  if (hours === null || hours <= 0) throw new Error('No actual hours recorded for this quoted job.')
  return { jobNumber, jobName, type: 'quoted', profit, hours, quotedHours, workers, hoursSource, labour: { quotedCost, actualCost } }
}

function labourLines(rows) {
  const out = []
  const start = rows.findIndex((r) => r[0] === 'Product Category: Labour')
  if (start === -1) return out
  for (let i = start + 1; i < rows.length; i++) {
    const row = rows[i]
    if (typeof row[0] === 'string' && row[0].startsWith('Total: Product Category')) break
    const name = String(row[2] ?? '').trim()
    const quantity = toNumber(row[6])
    if (!name || quantity === null) continue
    out.push({ name, hours: quantity })
  }
  return out
}

// The whole job's Summary Total profit — what the export prompt reads off the screen,
// so the manifest check uses it (labour-only profit wouldn't match the screen).
export function chargeUpTotalProfit(workbook) {
  const total = (sheetRows(workbook, 'Summary') ?? []).find((r) => r[0] === 'Total')
  return toNumber(total?.[3]) ?? NaN
}

export function parseChargeUp(workbook) {
  const summary = sheetRows(workbook, 'Summary')
  const sold = sheetRows(workbook, 'Sold')
  if (!summary || !sold) throw new Error('Charge-up export is missing its Summary or Sold sheet.')
  // Category,Actual Cost,Actual Sell,Profit,Margin
  const labour = summary.find((r) => r[0] === 'Labour')
  const actualCost = toNumber(labour?.[1]) ?? 0, actualSell = toNumber(labour?.[2]) ?? 0
  const profit = actualSell - actualCost

  // Sold labour = the actual hours, per person; Unsold labour total kept alongside.
  const workers = labourLines(sold)
  const sum = (lines) => lines.reduce((t, w) => t + w.hours, 0)
  const hours = sum(workers), unsoldHours = sum(labourLines(sheetRows(workbook, 'Unsold') ?? []))
  if (hours <= 0) throw new Error('No labour hours on the Sold sheet.')
  return { type: 'chargeup', profit, hours, quotedHours: hours + unsoldHours, unsoldHours, workers, hoursSource: 'sold', labour: { actualCost, actualSell } }
}

export function toRecord(result, { jobNumber, jobName, sourceFile, timesheetFile }) {
  const record = {
    jobNumber: String(jobNumber ?? result.jobNumber),
    jobName: jobName ?? result.jobName,
    type: result.type,
    profit: result.profit,
    hours: Math.round(result.hours * 100) / 100,
    gpPerHour: Math.round((result.profit / result.hours) * 100) / 100,
    ...(result.quotedHours != null && { quotedHours: Math.round(result.quotedHours * 100) / 100 }),
    ...(result.unsoldHours != null && { unsoldHours: Math.round(result.unsoldHours * 100) / 100 }),
    workers: result.workers,
    labour: Object.fromEntries(Object.entries(result.labour ?? {}).map(([k, v]) => [k, Math.round(v * 100) / 100])),
    addedAt: new Date().toISOString().slice(0, 10),
    sourceFile,
  }
  if (timesheetFile) record.timesheetFile = timesheetFile
  return record
}

// Replace-by-job-number, so re-running a month is safe.
export function upsertCompletedJobs(outPath, records) {
  const existing = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : []
  const incoming = new Set(records.map((r) => r.jobNumber))
  const merged = [...existing.filter((j) => !incoming.has(j.jobNumber)), ...records]
  writeFileSync(outPath, JSON.stringify(merged, null, 2) + '\n')
  return merged.length
}

// Just the job number from a quoted P&L export (its Quotes sheet), without parsing hours.
export function quotedJobNumber(workbook) {
  const quotes = sheetRows(workbook, 'Quotes') ?? []
  const row = quotes[quotes.findIndex((r) => r[0] === 'Quote Number') + 1]
  return row ? String(row[0]).trim() : null
}

// ---------------------------------------------------------------- whole-folder loading
// Reads a folder of completed-job exports (see scripts/add-completed-jobs.mjs for the
// accepted layouts). Returns { records, skipped, problems, notes }; `problems` means the
// manifest and the downloads disagree and nothing should be loaded.
export function loadCompletedFolder(folder) {
const files = readdirSync(folder).filter((f) => f.toLowerCase().endsWith('.xlsx'))
const names = new Map()
for (const f of files.filter((f) => /^jobs/i.test(f))) {
  const rows = sheetRows(readWorkbook(join(folder, f)), 'Data') ?? []
  const h = rows.findIndex((r) => r.includes('Job No.'))
  if (h === -1) continue
  const iNo = rows[h].indexOf('Job No.'), iName = rows[h].indexOf('Name')
  for (const r of rows.slice(h + 1)) if (r[iNo]) names.set(String(r[iNo]).trim(), String(r[iName] ?? '').trim())
}

// ---------- manifest mode: map Katipolt's raw download names to CU-/Q- names in memory
const notes = []
const renamed = new Map()          // raw file name → CU-<job>.xlsx / Q-<job>-pl.xlsx / Q-<job>-ts.xlsx
const manifestFile = files.length && readdirSync(folder).find((f) => f.toLowerCase() === 'manifest.csv')
if (manifestFile) {
  const lines = readFileSync(join(folder, manifestFile), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  const header = lines.shift().split(',').map((h) => h.trim().toLowerCase())
  const rows = lines.map((l) => Object.fromEntries(l.split(',').map((v, i) => [header[i], v.trim()])))
    .sort((a, b) => Number(a.order) - Number(b.order))
  // Chrome's own ordering: base name (P&L names carry the export minute), then " (n)"
  const orderKey = (f) => { const m = f.match(/^(.*?)(?: \((\d+)\))?\.xlsx$/i); return [m[1], Number(m[2] ?? 0)] }
  const byOrder = (a, b) => { const [ba, na] = orderKey(a), [bb, nb] = orderKey(b); return ba < bb ? -1 : ba > bb ? 1 : na - nb }
  const pls = files.filter((f) => /^ProfitAndLoss/i.test(f)).sort(byOrder)
  const tss = files.filter((f) => /^Timesheets/i.test(f)).sort(byOrder)
  const want = { pl: rows.filter((r) => r.file === 'pl'), ts: rows.filter((r) => r.file === 'ts') }
  const problems = []
  if (pls.length !== want.pl.length) problems.push(`${pls.length} ProfitAndLoss file(s) but the manifest lists ${want.pl.length} — move any older Katipolt downloads out of the folder`)
  if (tss.length !== want.ts.length) problems.push(`${tss.length} Timesheets file(s) but the manifest lists ${want.ts.length}`)
  const near = (a, b, tol) => Math.abs(a - b) <= tol
  if (!problems.length) {
    want.pl.forEach((r, i) => {
      const f = pls[i], wb = readWorkbook(join(folder, f)), kind = exportKind(wb)
      if (kind !== r.type) return problems.push(`#${r.order} job ${r.job}: ${f} is a ${kind ?? 'unknown'} export, manifest says ${r.type}`)
      if (kind === 'quoted') {
        const inFile = quotedJobNumber(wb)
        if (inFile !== r.job) return problems.push(`#${r.order} job ${r.job}: ${f} is for job ${inFile}`)
      } else if (r.check) {
        const p = chargeUpTotalProfit(wb)
        if (!near(p, Number(r.check), 1)) return problems.push(`#${r.order} job ${r.job}: ${f} has profit ${p.toFixed(2)}, screen showed ${r.check}`)
      }
      renamed.set(f, r.type === 'quoted' ? `Q-${r.job}-pl.xlsx` : `CU-${r.job}.xlsx`)
    })
    want.ts.forEach((r, i) => {
      const f = tss[i]
      if (r.check) {
        const h = readTimesheetWorkers(readWorkbook(join(folder, f))).reduce((s, w) => s + w.hours, 0)
        if (!near(h, Number(r.check), 0.01)) return problems.push(`#${r.order} job ${r.job}: ${f} has ${h} h, screen showed ${r.check} h`)
      }
      renamed.set(f, `Q-${r.job}-ts.xlsx`)
    })
  }
  if (problems.length) return { records: [], skipped: [], problems, notes }
  for (const r of rows.filter((r) => r.file === 'none')) notes.push(`job ${r.job} had nothing to export in Katipolt`)
  notes.push(`Matched ${renamed.size} download(s) to jobs using ${manifestFile}.`)
}
const logical = (f) => renamed.get(f) ?? f
const physical = new Map([...renamed].map(([raw, name]) => [name.toLowerCase(), raw]))
const pathOf = (name) => join(folder, physical.get(name.toLowerCase()) ?? name)

const records = [], skipped = []
for (const raw of files) {
  const f = logical(raw)
  let m
  try {
    if ((m = f.match(/^CU-(\d+)\.xlsx$/i))) {
      const wb = readWorkbook(pathOf(f))
      if (exportKind(wb) !== 'chargeup') throw new Error(`not a charge-up P&L export (sheets: ${wb.SheetNames.join(', ')})`)
      const job = m[1]
      records.push(toRecord(parseChargeUp(wb), { jobNumber: job, jobName: names.get(job) || `Job ${job}`, sourceFile: f }))
    } else if ((m = f.match(/^Q-(\d+)-pl\.xlsx$/i))) {
      const job = m[1], tsName = files.map(logical).find((x) => x.toLowerCase() === `q-${job}-ts.xlsx`)
      const wb = readWorkbook(pathOf(f))
      if (exportKind(wb) !== 'quoted') throw new Error(`not a quoted P&L export (sheets: ${wb.SheetNames.join(', ')})`)
      const result = parseQuoted(wb, tsName ? readWorkbook(pathOf(tsName)) : null)
      if (result.jobNumber !== job) throw new Error(`file says job ${job} but the export is for ${result.jobNumber}`)
      if (!tsName) skipped.push({ job, file: f, reason: 'loaded, but no timesheet export — used the Budgeted labour total instead' })
      records.push(toRecord(result, { jobName: names.get(job) || result.jobName, sourceFile: f, timesheetFile: tsName }))
    }
  } catch (err) {
    skipped.push({ job: m?.[1] ?? '?', file: f, reason: err.message })
  }
}

records.sort((a, b) => b.gpPerHour - a.gpPerHour)
return { records, skipped, problems: [], notes }
}
