// Parsing for completed-job P&L exports, shared by add-completed-job.mjs (one job)
// and add-completed-jobs.mjs (a folder of them):
//
//   Quoted    ("Quotes" sheet) — labour profit = the Summary sheet's Labour Quoted
//             Cost − Labour Actual Cost; hours come from the job's Timesheets export
//             when given (per worker), otherwise the Budgeted sheet's Labour
//             "Actual Quantity". Quoted hours = the Budgeted Labour "Quoted Quantity".
//   Charge-up ("Sold"/"Unsold", no "Quotes") — profit = the Summary sheet's Total
//             profit (the whole job). Actual hours = the Sold sheet's
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

// Margins arrive either as a fraction (0.4331) or as text ("56.62%").
function toFraction(v) {
  if (typeof v === 'string' && v.includes('%')) { const n = toNumber(v); return n === null ? null : n / 100 }
  return toNumber(v)
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
  const total = summary.find((r) => r[0] === 'Total') ?? []
  const above = (label) => summary.find((r) => r[0] === label)?.[1]
  const pl = {
    quotedCost: toNumber(total[1]), actualCost: toNumber(total[2]),
    quotedProfit: toNumber(total[5]), quotedMargin: toFraction(total[7]),
    profitToDate: toNumber(above('Profit to Date')), marginToDate: toFraction(above('Margin to Date')),
  }
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
  // No actual hours (nothing booked yet): still loaded with its costs and profit,
  // flagged 'no-sold-hours' by toRecord, with no GP/hr — same as a charge-up job.
  hours = hours ?? 0
  return { jobNumber, jobName, type: 'quoted', profit, hours, quotedHours, workers, hoursSource, labour: { quotedCost, actualCost }, pl }
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
  const profit = chargeUpTotalProfit(workbook)
  if (!Number.isFinite(profit)) throw new Error('Could not read Profit from the Summary sheet Total row.')
  const total = summary.find((r) => r[0] === 'Total') ?? []
  const pl = { actualCost: toNumber(total[1]), profitToDate: profit, marginToDate: toFraction(total[4]) }

  // Sold labour = the actual hours, per person; Unsold labour total kept alongside.
  const workers = labourLines(sold)
  const sum = (lines) => lines.reduce((t, w) => t + w.hours, 0)
  const hours = sum(workers), unsoldHours = sum(labourLines(sheetRows(workbook, 'Unsold') ?? []))
  // No sold hours (all unsold, e.g. warranty): still loaded with its profit and
  // costs, but there's no GP/hr — the record is flagged 'no-sold-hours'.
  return { type: 'chargeup', profit, hours, quotedHours: hours + unsoldHours, unsoldHours, workers, hoursSource: 'sold', labour: { actualCost, actualSell }, pl }
}

// Flags a job to check: 'no-name' (no name in Katipolt — shown as its number)
// and 'no-sold-hours' (nothing to divide the profit by, so no GP/hr).
export function toRecord(result, { jobNumber, jobName, sourceFile, timesheetFile }) {
  const number = String(jobNumber ?? result.jobNumber)
  const name = String(jobName ?? result.jobName ?? '').trim()
  const flags = [...(name ? [] : ['no-name']), ...(result.hours > 0 ? [] : ['no-sold-hours'])]
  const record = {
    jobNumber: number,
    jobName: name || number,
    ...(flags.length && { flags }),
    type: result.type,
    profit: result.profit,
    hours: Math.round(result.hours * 100) / 100,
    gpPerHour: result.hours > 0 ? Math.round((result.profit / result.hours) * 100) / 100 : null,
    ...(result.quotedHours != null && { quotedHours: Math.round(result.quotedHours * 100) / 100 }),
    ...(result.unsoldHours != null && { unsoldHours: Math.round(result.unsoldHours * 100) / 100 }),
    workers: result.workers,
    labour: Object.fromEntries(Object.entries(result.labour ?? {}).map(([k, v]) => [k, Math.round(v * 100) / 100])),
    // P&L headline figures; margins as fractions (0.43 = 43%)
    pl: Object.fromEntries(Object.entries(result.pl ?? {}).filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => [k, k.endsWith('Margin') || k === 'marginToDate' ? Math.round(v * 10000) / 10000 : Math.round(v * 100) / 100])),
    addedAt: new Date().toISOString().slice(0, 10),
    sourceFile,
  }
  if (timesheetFile) record.timesheetFile = timesheetFile
  return record
}

// The month a batch of jobs was completed in, "YYYY-MM". Katipolt's "Completed:
// This Month" filter is what the exports come from, so it's the month the upload
// is for — taken as given when valid, otherwise the month (NZ time) of `date`.
export function completedMonth(given, date = new Date()) {
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(given ?? '')) return given
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit' }).format(new Date(date)).slice(0, 7)
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

// ---------------------------------------------------------------- manifest matching
// manifest.csv: order,job,type,file,check. `file` is pl | ts | none (the download is
// found by ORDER) or an actual file name (found by NAME). Forgiving about what
// can't hurt, strict about what could put a number on the wrong job:
//   · job numbers like "8840.0" (saved from a spreadsheet) are read as 8840
//   · a blank job is fine for a quoted P&L (the job number is inside the file);
//     a charge-up export with no job number can't be loaded, so it's listed in
//     `unresolved` instead of guessed, and everything else still loads
//   · a timesheet hours check of 0 or blank is ignored (it's a failed screen read)
//   · Chrome numbers same-minute downloads "(1)", "(2)" — the order they really
//     came in isn't always the obvious one, so each such group is tried in every
//     order and the one that satisfies the manifest's checks is used
//   · any row that has a job number or check and still contradicts its file is a
//     problem, and then nothing is loaded
const cleanJob = (v) => String(v ?? '').trim().replace(/\.0+$/, '')
const baseAndNum = (f) => { const m = f.match(/^(.*?)(?: \((\d+)\))?\.xlsx$/i); return [m?.[1] ?? f, Number(m?.[2] ?? 0)] }
const byConvention = (a, b) => { const [ba, na] = baseAndNum(a), [bb, nb] = baseAndNum(b); return ba < bb ? -1 : ba > bb ? 1 : na - nb }

function permutations(arr) {
  if (arr.length <= 1) return [arr]
  const out = []
  arr.forEach((x, i) => permutations([...arr.slice(0, i), ...arr.slice(i + 1)]).forEach((rest) => out.push([x, ...rest])))
  return out
}

export function matchManifest(folder, files, manifestText, manifestName = 'manifest.csv') {
  const lines = manifestText.replace(/^\uFEFF/, '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  const header = (lines.shift() ?? '').split(',').map((h) => h.trim().toLowerCase())
  const rows = lines
    .map((l) => Object.fromEntries(l.split(',').map((v, i) => [header[i], v.trim()])))
    .map((r) => ({ ...r, job: cleanJob(r.job), type: (r.type ?? '').toLowerCase(), fileKey: (r.file ?? '').toLowerCase() }))
    .sort((a, b) => Number(a.order) - Number(b.order))
  const byLowerName = new Map(files.map((f) => [f.toLowerCase(), f]))
  const renamed = new Map(), problems = [], notes = [], unresolved = []
  const cache = new Map()
  const wbOf = (f) => { if (!cache.has(f)) cache.set(f, readWorkbook(join(folder, f))); return cache.get(f) }
  const near = (a, b, tol) => Math.abs(a - b) <= tol
  const hoursOf = (f) => readTimesheetWorkers(wbOf(f)).reduce((t, w) => t + w.hours, 0)

  // Why this file can't be the one this manifest row describes (null = it can).
  function contradiction(kind, r, f) {
    if (kind === 'pl') {
      const wb = wbOf(f), k = exportKind(wb)
      if (r.type && k !== r.type) return `is a ${k ?? 'unknown'} export, manifest says ${r.type}`
      if (k === 'quoted') {
        const inFile = quotedJobNumber(wb)
        if (r.job && inFile !== r.job) return `is for job ${inFile}`
      } else if (r.check !== '' && Number.isFinite(Number(r.check))) {
        const p = chargeUpTotalProfit(wb)
        if (!near(p, Number(r.check), 1)) return `has profit ${p.toFixed(2)}, screen showed ${r.check}`
      }
      return null
    }
    const c = Number(r.check)
    if (r.check !== '' && Number.isFinite(c) && c !== 0) {
      let h; try { h = hoursOf(f) } catch { return null }
      if (!near(h, c, 0.01)) return `has ${h} h, screen showed ${r.check} h`
    }
    return null
  }

  const pairs = []                                   // [kind, row, file]
  const claimed = new Set()
  for (const r of rows) {                            // rows that name their file
    const f = byLowerName.get(r.fileKey)
    if (!f) continue
    const kind = /^timesheets/i.test(f) ? 'ts' : 'pl'
    const why = contradiction(kind, r, f)
    if (why) problems.push(`#${r.order} job ${r.job || '?'}: ${f} ${why}`)
    else { pairs.push([kind, r, f]); claimed.add(f) }
  }
  for (const kind of ['pl', 'ts']) {                 // rows that rely on download order
    const want = rows.filter((r) => r.fileKey === kind)
    const have = files.filter((f) => (kind === 'pl' ? /^ProfitAndLoss/i : /^Timesheets/i).test(f) && !claimed.has(f)).sort(byConvention)
    if (!want.length && !have.length) continue
    if (have.length !== want.length) {
      problems.push(kind === 'pl'
        ? `${have.length} ProfitAndLoss file(s) but the manifest lists ${want.length} — move any older Katipolt downloads out of the folder`
        : `${have.length} Timesheets file(s) but the manifest lists ${want.length}`)
      continue
    }
    const groups = []
    for (const f of have) { const base = baseAndNum(f)[0]; if (groups.at(-1)?.base === base) groups.at(-1).files.push(f); else groups.push({ base, files: [f] }) }
    let at = 0
    for (const g of groups) {
      const slice = want.slice(at, at + g.files.length); at += g.files.length
      const orders = g.files.length <= 5 ? permutations(g.files) : [g.files]
      const ok = orders.find((o) => o.every((f, i) => !contradiction(kind, slice[i], f)))
      if (ok) ok.forEach((f, i) => pairs.push([kind, slice[i], f]))
      else g.files.forEach((f, i) => problems.push(`#${slice[i].order} job ${slice[i].job || '?'}: ${f} ${contradiction(kind, slice[i], f)}`))
    }
  }
  if (problems.length) return { renamed, problems, notes, unresolved }

  const taken = new Set()
  const give = (f, logical, note) => {
    if (taken.has(logical)) { notes.push(`${note} — ${f} is a repeat, so the first one was used`); return }
    taken.add(logical); renamed.set(f, logical)
  }
  for (const [kind, r, f] of pairs) {
    if (kind === 'pl') {
      const wb = wbOf(f), k = exportKind(wb)
      if (k === 'quoted') {
        const job = quotedJobNumber(wb)
        give(f, `Q-${job}-pl.xlsx`, `Job ${job} was exported more than once`)
      } else if (r.job) give(f, `CU-${r.job}.xlsx`, `Job ${r.job} was exported more than once`)
      else {
        let detail = ''
        try { const c = parseChargeUp(wb); detail = `, ${c.hours} sold h (${[...new Set(c.workers.map((w) => w.name))].join(', ')})` } catch { detail = ', no sold hours' }
        unresolved.push({ job: 'Charge-up', file: f, reason: `${f}: profit $${chargeUpTotalProfit(wb).toFixed(2)}${detail} — put its job number in manifest.csv and upload again` })
      }
    } else if (r.type === 'quoted' && r.job) give(f, `Q-${r.job}-ts.xlsx`, `Job ${r.job}'s timesheet was listed more than once`)
    else notes.push(`${f} is a timesheet with no quoted job in the manifest, so it was left out`)
  }
  for (const r of rows.filter((r) => r.fileKey === 'none')) notes.push(`job ${r.job} had nothing to export in Katipolt`)
  notes.push(`Matched ${renamed.size} download(s) to jobs using ${manifestName}.`)
  return { renamed, problems, notes, unresolved }
}

// ---------------------------------------------------------------- Profit & Loss Summary
// Katipolt's "Profit & Loss Summary" report has one row per job — job number, stage,
// type, quoted/actual hours, cost, sell, profit and margin — priced at Katipolt's
// current rates. It is the source of every job's FIGURES; the per-job P&L exports
// are only needed to tell who worked on a job and for how long (and, for a
// charge-up job, to know which job a file is — the file itself doesn't say, so it's
// matched to a report row by its sell and hours).
const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100)
const r4 = (v) => (v == null ? null : Math.round(v * 10000) / 10000)

export function readSummaryReport(folder, files) {
  for (const f of files) {
    let wb
    try { wb = readWorkbook(join(folder, f)) } catch { continue }
    const rows = sheetRows(wb, 'Data')
    const h = rows ? rows.findIndex((r) => r.includes('Job Number') && r.includes('Actual Profit')) : -1
    if (h === -1) continue
    const ix = (k) => rows[h].indexOf(k)
    const n = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v))
    const map = new Map()
    for (const r of rows.slice(h + 1)) {
      const job = cleanJob(r[ix('Job Number')])
      if (!/^\d+$/.test(job)) continue                       // the Total row, blanks
      const t = String(r[ix('Type')]).trim()
      map.set(job, {
        job, stage: String(r[ix('Job Stage')]).trim(), customer: String(r[ix('Customer')] ?? '').trim(),
        type: t === 'Quoted' ? 'quoted' : t === 'Charge Up' ? 'chargeup' : null,
        quotedHours: n(r[ix('Quoted Hours')]), actualHours: n(r[ix('Actual Hours')]),
        quotedCost: n(r[ix('Quoted Cost')]), actualCost: n(r[ix('Actual Cost')]),
        quotedSell: n(r[ix('Quoted Sell')]), actualSell: n(r[ix('Actual Sell')]),
        quotedProfit: n(r[ix('Quoted Profit')]), actualProfit: n(r[ix('Actual Profit')]),
        quotedMargin: n(r[ix('Quoted Margin')]), actualMargin: n(r[ix('Actual Margin')]),
      })
    }
    return { file: f, rows: map }
  }
  return null
}

// Overwrite a record's figures with the report's row for that job.
export function applySummary(record, row, date) {
  const pl = { ...(record.pl ?? {}) }
  pl.actualCost = r2(row.actualCost); pl.profitToDate = r2(row.actualProfit); pl.marginToDate = r4(row.actualMargin)
  if (record.type === 'quoted') { pl.quotedCost = r2(row.quotedCost); pl.quotedProfit = r2(row.quotedProfit); pl.quotedMargin = r4(row.quotedMargin) }
  for (const k of Object.keys(pl)) if (pl[k] == null) delete pl[k]
  record.pl = pl
  if (record.type === 'chargeup' && row.actualProfit != null) {
    record.profit = row.actualProfit
    record.gpPerHour = record.hours > 0 ? r2(record.profit / record.hours) : null
  }
  record.plSummaryDate = date
}

const totalHours = (rows) => {
  let on = false, t = 0
  for (const r of rows ?? []) {
    if (r[0] === 'Product Category: Labour') { on = true; continue }
    if (on && typeof r[0] === 'string' && r[0].startsWith('Total: Product Category')) break
    if (on && r[2] && toNumber(r[6]) != null) t += toNumber(r[6])
  }
  return t
}

// Give the files no manifest named (or whose manifest row had no job number) their
// job from the report: a quoted P&L says its own job; a charge-up P&L is paired
// with the report row that has the same total sell, the same total hours and the
// nearest profit; a timesheet with the quoted job whose actual hours equal its
// total. Files that can't be paired confidently are left for the caller to list.
function matchFromSummary(folder, files, renamed, summary, notes) {
  const taken = new Set([...renamed.values()])
  const used = new Set([...renamed.values()].map((n) => n.match(/^(?:CU|Q)-(\d+)/i)?.[1]).filter(Boolean))
  const pairs = []                                   // [file, job, kind]
  const rest = files.filter((f) => !renamed.has(f) && /^ProfitAndLoss/i.test(f))
  const chargeups = []
  for (const f of rest.sort(byConvention)) {
    let wb; try { wb = readWorkbook(join(folder, f)) } catch { continue }
    const k = exportKind(wb)
    if (k === 'quoted') {
      const job = quotedJobNumber(wb), logical = `Q-${job}-pl.xlsx`
      if (taken.has(logical)) { notes.push(`Job ${job} was exported more than once — ${f} is a repeat, so the first one was used`); continue }
      taken.add(logical); used.add(job); renamed.set(f, logical)
    } else if (k === 'chargeup') {
      const tot = (sheetRows(wb, 'Summary') ?? []).find((r) => r[0] === 'Total') ?? []
      chargeups.push({ f, sell: toNumber(tot[2]), profit: toNumber(tot[3]), hours: totalHours(sheetRows(wb, 'Sold')) + totalHours(sheetRows(wb, 'Unsold') ?? []) })
    }
  }
  // charge-up files ↔ report rows, best (smallest profit gap) pairs first
  const cands = [...summary.rows.values()].filter((r) => r.type === 'chargeup' && !used.has(r.job))
  const scored = []
  for (const x of chargeups) for (const c of cands) {
    if (x.sell == null || c.actualSell == null || Math.abs(x.sell - c.actualSell) > 0.02) continue
    if (Math.abs(x.hours - (c.actualHours ?? 0)) > 0.011) continue
    const gap = Math.abs((x.profit ?? 0) - (c.actualProfit ?? 0))
    if (gap <= 50) scored.push({ x, c, gap })
  }
  scored.sort((a, b) => a.gap - b.gap)
  const doneFiles = new Set(), doneJobs = new Set(), noted = new Set()
  for (const { x, c, gap } of scored) {
    if (doneFiles.has(x.f) || doneJobs.has(c.job)) continue
    doneFiles.add(x.f); doneJobs.add(c.job); used.add(c.job)
    renamed.set(x.f, `CU-${c.job}.xlsx`); pairs.push([x.f, c.job])
    const twins = scored.filter((o) => o.x !== x && o.c !== c && o.gap === gap && o.x.sell === x.sell && o.x.hours === x.hours && Math.abs(o.x.profit - x.profit) < 0.011)
    const pairKey = twins.length ? [c.job, twins[0].c.job].sort().join('/') : ''
    if (twins.length && !noted.has(pairKey)) {
      noted.add(pairKey)
      notes.push(`${x.f} and another file have identical figures, so jobs ${c.job} and ${twins[0].c.job} were paired arbitrarily — the numbers are the same either way`)
    }
  }
  // timesheets ↔ quoted jobs, by total hours
  const tsFiles = files.filter((f) => !renamed.has(f) && /^Timesheets/i.test(f))
  const quotedNoTs = [...used].filter((j) => summary.rows.get(j)?.type === 'quoted' && [...taken].includes(`Q-${j}-pl.xlsx`) && !taken.has(`Q-${j}-ts.xlsx`))
  for (const f of tsFiles) {
    let h; try { h = readTimesheetWorkers(readWorkbook(join(folder, f))).reduce((t, w) => t + w.hours, 0) } catch { continue }
    const hit = quotedNoTs.filter((j) => Math.abs((summary.rows.get(j).actualHours ?? -1) - h) <= 0.011 && !taken.has(`Q-${j}-ts.xlsx`))
    if (hit.length === 1) { renamed.set(f, `Q-${hit[0]}-ts.xlsx`); taken.add(`Q-${hit[0]}-ts.xlsx`) }
  }
  if (pairs.length) notes.push(`Matched ${pairs.length} charge-up file(s) to jobs using the Profit & Loss Summary (same sell and hours).`)
}

// ---------------------------------------------------------------- whole-folder loading
// Reads a folder of completed-job exports (see scripts/add-completed-jobs.mjs for the
// accepted layouts). Returns { records, skipped, problems, notes }; `problems` means the
// manifest and the downloads disagree and nothing should be loaded.
export function loadCompletedFolder(folder, { known = new Set() } = {}) {
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
let renamed = new Map()            // raw file name → CU-<job>.xlsx / Q-<job>-pl.xlsx / Q-<job>-ts.xlsx
const unresolved = []              // charge-up exports the manifest couldn't put a job number on
const manifestFile = files.length && readdirSync(folder).find((f) => f.toLowerCase() === 'manifest.csv')
if (manifestFile) {
  const m = matchManifest(folder, files, readFileSync(join(folder, manifestFile), 'utf8'), manifestFile)
  if (m.problems.length) return { records: [], skipped: [], problems: m.problems, notes: m.notes }
  renamed = m.renamed
  notes.push(...m.notes)
  unresolved.push(...m.unresolved)
}
const summary = readSummaryReport(folder, files)
if (summary) {
  matchFromSummary(folder, files, renamed, summary, notes)
  for (let i = unresolved.length - 1; i >= 0; i--) if (renamed.has(unresolved[i].file)) unresolved.splice(i, 1)
  notes.push(`Figures taken from ${summary.file}.`)
}
const logical = (f) => renamed.get(f) ?? f
const physical = new Map([...renamed].map(([raw, name]) => [name.toLowerCase(), raw]))
const pathOf = (name) => join(folder, physical.get(name.toLowerCase()) ?? name)

const records = [], skipped = [...unresolved]
for (const raw of files) {
  const f = logical(raw)
  let m
  try {
    if ((m = f.match(/^CU-(\d+)\.xlsx$/i))) {
      const wb = readWorkbook(pathOf(f))
      if (exportKind(wb) !== 'chargeup') throw new Error(`not a charge-up P&L export (sheets: ${wb.SheetNames.join(', ')})`)
      const job = m[1]
      records.push(toRecord(parseChargeUp(wb), { jobNumber: job, jobName: names.get(job) || '', sourceFile: f }))
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

const today = new Date().toISOString().slice(0, 10)
if (summary) for (const r of records) { const row = summary.rows.get(r.jobNumber); if (row) applySummary(r, row, today) }
// completed jobs the report lists that nobody uploaded a P&L for (and aren't loaded already)
const loadedNow = new Set(records.map((r) => r.jobNumber))
const summaryMissing = summary
  ? [...summary.rows.values()].filter((r) => r.type && /completed/i.test(r.stage) && !loadedNow.has(r.job) && !known.has(r.job) && !skipped.some((s) => String(s.job) === r.job))
    .map((r) => ({ job: r.job, reason: `in the Profit & Loss Summary (${r.type === 'quoted' ? 'quoted' : 'charge-up'}, ${r.customer}) but no P&L file was uploaded for it` }))
  : []

records.sort((a, b) => (b.gpPerHour ?? -Infinity) - (a.gpPerHour ?? -Infinity))
return { records, skipped: [...skipped, ...summaryMissing], problems: [], notes }
}
