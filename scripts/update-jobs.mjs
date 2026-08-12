#!/usr/bin/env node
// Merges a folder of per-job Profit & Loss exports into
// Cassidy_Davies_Electrical_BPMN_Data.xlsx, refreshing each matched job's
// figures in the "Deliverables Sheet" that the dashboard reads.
//
// Usage: node scripts/update-jobs.mjs [path-to-folder]   (defaults to ./imports)
//
// What it does:
//   1. Dedupes the export files in the folder by exact content hash,
//      moving duplicates into <folder>/_duplicates/.
//   2. Reads each unique export's "Quotes" sheet (for job number/name) and
//      "Summary" sheet (for cost/margin figures).
//   3. Finds each job's block in the workbook's Deliverables Sheet and
//      fills the NEXT EMPTY week row after the block's current data (Week 1,
//      then Week 2, ...) — preserving prior weeks' snapshots rather than
//      overwriting them. If every week row (1-5) already has data, that job
//      is reported as needing a manual monthly rollover first: move the
//      current Week 5 figures up into "Start of month", clear Weeks 1-5,
//      then re-run.
//   4. Reports which jobs were updated, which jobs have no empty week slot
//      left, which export files couldn't be matched to a job, and which
//      existing jobs got no new data.
//   5. Bumps sync-meta.json's timestamp.
//   6. Archives everything that was in the folder (processed files,
//      duplicates, unreadable files) into imports-archive/<YYYY-MM-DD>/,
//      leaving the folder empty and ready for next week's drop.
//
// It does NOT commit or push — review the printed summary, then
// `git add Cassidy_Davies_Electrical_BPMN_Data.xlsx sync-meta.json`,
// commit, and push yourself (or ask Claude to).

import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync, mkdirSync, renameSync, statSync, existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import * as XLSX from 'xlsx'

// The ESM build of `xlsx` can't auto-detect Node's `fs` module, which
// breaks XLSX.readFile/writeFile under `import` (they throw "Cannot access
// file ..." even when the file exists) — read/write buffers via node:fs
// and hand them to XLSX.read/XLSX.write instead.
function readWorkbook(path) {
  return XLSX.read(readFileSync(path), { type: 'buffer', cellStyles: true })
}
function writeWorkbook(wb, path) {
  writeFileSync(path, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
}

const folder = resolve(process.argv[2] ?? 'imports')
const workbookPath = resolve('Cassidy_Davies_Electrical_BPMN_Data.xlsx')
const syncMetaPath = resolve('sync-meta.json')

// ---------------------------------------------------------------------------
// 1. Dedupe the folder by content hash.
// ---------------------------------------------------------------------------

function dedupeFolder(dir) {
  const entries = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.xlsx'))
  const seen = new Map() // hash -> kept filename
  const dupes = []

  for (const name of entries.sort()) {
    const full = join(dir, name)
    if (!statSync(full).isFile()) continue
    const hash = createHash('md5').update(readFileSync(full)).digest('hex')
    if (seen.has(hash)) {
      dupes.push(name)
    } else {
      seen.set(hash, name)
    }
  }

  if (dupes.length > 0) {
    const dupeDir = join(dir, '_duplicates')
    mkdirSync(dupeDir, { recursive: true })
    for (const name of dupes) {
      renameSync(join(dir, name), join(dupeDir, name))
    }
  }

  return { kept: [...seen.values()], dupes }
}

// ---------------------------------------------------------------------------
// 2. Extract job number/name + cost figures from one export file.
// ---------------------------------------------------------------------------

function parseMoney(v) {
  if (typeof v === 'number') return v
  if (typeof v !== 'string') return null
  const n = Number(v.replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

function parsePercent(v) {
  if (typeof v === 'number') return v
  if (typeof v !== 'string') return null
  const n = Number(v.replace(/[^0-9.-]/g, ''))
  if (!Number.isFinite(n)) return null
  return v.includes('%') ? n / 100 : n
}

function extractJobExport(filePath) {
  const wb = readWorkbook(filePath)
  if (!wb.SheetNames.includes('Quotes') || !wb.SheetNames.includes('Summary')) {
    return { file: filePath, error: 'missing Quotes/Summary sheet (likely a blank or different report type)' }
  }

  const quoteRows = XLSX.utils.sheet_to_json(wb.Sheets['Quotes'], { header: 1, defval: '' })
  let baseRow = null
  for (let i = 4; i < quoteRows.length; i++) {
    const r = quoteRows[i]
    if (r[0] !== '' && r[0] !== undefined) {
      baseRow = r
      break
    }
  }
  if (!baseRow) return { file: filePath, error: 'no job number found in Quotes sheet' }

  const jobNumber = String(baseRow[0]).trim()
  const jobName = String(baseRow[1]).trim()

  const summaryRows = XLSX.utils.sheet_to_json(wb.Sheets['Summary'], { header: 1, defval: '' })
  const rec = { file: filePath, jobNumber, jobName }

  for (const row of summaryRows) {
    const label = String(row[0]).trim()
    if (label === 'Payment Claims to Date') rec.claimToDate = parseMoney(row[1])
    if (label === 'Profit to Date') rec.profitToDate = parseMoney(row[1])
    if (label === 'Margin to Date') rec.marginToDate = parsePercent(row[1])
    if (label === 'Total') {
      rec.totalQuotedCost = parseMoney(row[1])
      rec.totalActualCost = parseMoney(row[2])
      rec.quotedPrice = parseMoney(row[3])
      rec.quotedProfit = parseMoney(row[5])
      rec.quotedMargin = parsePercent(row[7])
    }
    if (label === 'Labour') {
      const qm = String(row[1]).match(/\$?([0-9,.]+)\s*\(([0-9.]+)\s*hours\)/)
      const am = String(row[2]).match(/\$?([0-9,.]+)\s*\(([0-9.]+)\s*hours\)/)
      if (qm) {
        rec.quotedLabourCost = parseMoney(qm[1])
        rec.quotedLabourHours = Number(qm[2])
      }
      if (am) {
        rec.actualLabourCost = parseMoney(am[1])
        rec.actualLabourHours = Number(am[2])
      }
    }
  }

  const required = [
    'claimToDate', 'totalQuotedCost', 'totalActualCost', 'quotedPrice',
    'quotedLabourCost', 'actualLabourCost', 'quotedLabourHours', 'actualLabourHours',
    'quotedProfit', 'quotedMargin', 'profitToDate', 'marginToDate',
  ]
  const missing = required.filter((f) => rec[f] === undefined || rec[f] === null)
  if (missing.length > 0) {
    return { file: filePath, jobNumber, jobName, error: `missing fields in Summary sheet: ${missing.join(', ')}` }
  }

  return rec
}

// ---------------------------------------------------------------------------
// 3. Locate job blocks in the Deliverables Sheet.
// ---------------------------------------------------------------------------

function normalizeHeader(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
}

// Several sheets in this workbook share a "Job Number" first column (e.g.
// "Main Sheet" is a checklist tab, not the costing tab) — matching on that
// alone picks the wrong sheet. Only a sheet with the cost columns too
// (Quoted Price, Total actual cost) is the real Deliverables Sheet, same
// disambiguation the dashboard's own loader (src/lib/loadWorkbook.js) uses.
function findDeliverablesSheet(workbook) {
  const candidates = []
  for (const name of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '' })
    const headerIdx = rows.findIndex((r) => normalizeHeader(r[0]) === 'job number')
    if (headerIdx === -1) continue
    const header = rows[headerIdx].map(normalizeHeader)
    if (!header.includes('quoted price') || !header.includes('total actual cost')) continue
    candidates.push({ name, rows, headerIdx })
  }
  const preferred = candidates.find((c) => !c.name.toLowerCase().includes('test'))
  const chosen = preferred ?? candidates[0]
  if (!chosen) throw new Error('Could not find the Deliverables Sheet (no sheet has Job Number + Quoted Price + Total actual cost columns)')
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

// Finds the row this week's update should land in: the next EMPTY week
// slot after whichever row currently holds data — not the last-filled row
// itself. This advances week to week (Week 1, then Week 2, ...) so each
// week's snapshot is preserved instead of being overwritten by the next
// update. Returns null if every week slot in the block already has data
// (the block needs a manual monthly rollover — see README note below).
function pickTargetRowIdx(block, rows) {
  let lastFilledPos = 0 // "Start of month" (position 0) always carries the baseline figures
  for (let i = block.weekIdxs.length - 1; i >= 0; i--) {
    const qp = Number(rows[block.weekIdxs[i]][3])
    if (Number.isFinite(qp) && qp > 0) {
      lastFilledPos = i
      break
    }
  }
  const targetPos = lastFilledPos + 1
  if (targetPos >= block.weekIdxs.length) return null
  return block.weekIdxs[targetPos]
}

// ---------------------------------------------------------------------------
// 4. Apply one job's refreshed figures onto its data row.
//    Columns are set by header meaning, not position — see FIELD_COLUMNS.
//    Only genuine inputs are set directly; the rest are the sheet's own
//    formula columns (kept intact) whose cached value we recompute to match
//    (see README-level note in the repo docs for the derivation).
// ---------------------------------------------------------------------------

const COL = {
  quotedPrice: 3, claimToDate: 4, remainingToClaim: 5, pctClaimRemaining: 6,
  totalQuotedCost: 7, totalActualCost: 8, quotedMaterialCost: 9, actualMaterialCost: 10,
  materialCostRemaining: 11, materialPctRemaining: 12,
  quotedLabourCost: 14, actualLabourCost: 15, labourCostRemaining: 16, labourCostPctRemaining: 17,
  quotedLabourHours: 18, actualLabourHours: 19, labourHoursRemaining: 20, labourHourPctRemaining: 21,
  gpPerHour: 23, quotedGpPerHour: 24, marginToDate: 25, quotedMargin: 26,
}

function applyJobUpdate(ws, rows, dataIdx, rec) {
  const {
    quotedPrice, claimToDate, totalQuotedCost, totalActualCost,
    quotedLabourCost, actualLabourCost, quotedLabourHours, actualLabourHours,
    quotedProfit, quotedMargin, profitToDate, marginToDate,
  } = rec

  // "Material" columns in this sheet are really "everything non-labour" —
  // derived as a residual so the profit/margin formulas stay internally
  // consistent, matching how the sheet's own formulas compute them.
  const quotedMaterialCost = totalQuotedCost - quotedLabourCost
  const actualMaterialCost = totalActualCost - actualLabourCost

  const remainingToClaim = quotedPrice - claimToDate
  const pctClaimRemaining = quotedPrice ? remainingToClaim / quotedPrice : 0
  const materialCostRemaining = quotedMaterialCost - actualMaterialCost
  const materialPctRemaining = quotedMaterialCost ? materialCostRemaining / quotedMaterialCost : 0
  const labourCostRemaining = quotedLabourCost - actualLabourCost
  const labourCostPctRemaining = quotedLabourCost ? labourCostRemaining / quotedLabourCost : 0
  const labourHoursRemaining = quotedLabourHours - actualLabourHours
  const labourHourPctRemaining = quotedLabourHours ? labourHoursRemaining / quotedLabourHours : 0
  const gpPerHour = actualLabourHours ? profitToDate / actualLabourHours : 0
  const quotedGpPerHour = quotedLabourHours ? quotedProfit / quotedLabourHours : 0

  const values = {
    quotedPrice, claimToDate, remainingToClaim, pctClaimRemaining,
    totalQuotedCost, totalActualCost, quotedMaterialCost, actualMaterialCost,
    materialCostRemaining, materialPctRemaining,
    quotedLabourCost, actualLabourCost, labourCostRemaining, labourCostPctRemaining,
    quotedLabourHours, actualLabourHours, labourHoursRemaining, labourHourPctRemaining,
    gpPerHour, quotedGpPerHour, marginToDate, quotedMargin,
  }

  for (const [field, value] of Object.entries(values)) {
    const col = COL[field]
    const addr = XLSX.utils.encode_cell({ r: dataIdx, c: col })
    const existing = ws[addr]
    ws[addr] = { ...(existing ?? {}), t: 'n', v: value }
    delete ws[addr].w
    rows[dataIdx][col] = value
  }

  return { totalActualCost, claimToDate, marginToDate }
}

// ---------------------------------------------------------------------------
// 5. Archive everything that was in the folder (processed files, the
//    _duplicates subfolder, unreadable files) into a dated subfolder of
//    imports-archive/, then leave the source folder empty for next time.
// ---------------------------------------------------------------------------

function archiveProcessedFiles(sourceDir) {
  const entries = readdirSync(sourceDir)
  if (entries.length === 0) return null

  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const archiveDir = join(dirname(sourceDir), 'imports-archive', dateStr)
  mkdirSync(archiveDir, { recursive: true })

  for (const name of entries) {
    const src = join(sourceDir, name)
    let dest = join(archiveDir, name)
    if (existsSync(dest)) {
      // Another run already archived a same-named file/folder today —
      // suffix with a timestamp rather than overwrite it.
      const stamp = Date.now()
      const dot = name.lastIndexOf('.')
      dest = join(archiveDir, dot > 0 ? `${name.slice(0, dot)}-${stamp}${name.slice(dot)}` : `${name}-${stamp}`)
    }
    renameSync(src, dest)
  }

  return { archiveDir, count: entries.length }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log(`Reading exports from ${folder}`)
  const { kept, dupes } = dedupeFolder(folder)
  if (dupes.length > 0) {
    console.log(`Moved ${dupes.length} exact duplicate(s) to _duplicates/:`)
    for (const d of dupes) console.log(`  - ${d}`)
  }
  console.log(`${kept.length} unique export file(s) to process`)

  const extracted = []
  const failures = []
  for (const name of kept) {
    const rec = extractJobExport(join(folder, name))
    if (rec.error) failures.push(rec)
    else extracted.push(rec)
  }

  console.log(`Reading workbook: ${workbookPath}`)
  const wb = readWorkbook(workbookPath)
  const { name: sheetName, rows, headerIdx } = findDeliverablesSheet(wb)
  const ws = wb.Sheets[sheetName]
  const blocks = buildJobBlocks(rows, headerIdx)
  // Real jobs only — a handful of junk blocks (job number 0 / blank name)
  // exist in the sheet and aren't real jobs, same filter the dashboard's
  // own loader applies.
  const isValidJobBlock = (b) => Number(b.jobNumber) > 0 && String(b.jobName ?? '').trim() !== '' && String(b.jobName).trim() !== '0'
  const existingJobNumbers = new Set(blocks.filter(isValidJobBlock).map((b) => Number(b.jobNumber)))

  const updated = []
  const unmatchedFiles = []
  const noRoomLeft = []

  for (const rec of extracted) {
    const jobNum = Number(rec.jobNumber)
    const block = blocks.find((b) => Number(b.jobNumber) === jobNum)
    if (!block) {
      unmatchedFiles.push(rec)
      continue
    }
    const dataIdx = pickTargetRowIdx(block, rows)
    if (dataIdx === null) {
      noRoomLeft.push(rec)
      continue
    }
    const weekLabel = rows[dataIdx][2] || 'Start of month'
    const before = { totalActualCost: rows[dataIdx][8], claimToDate: rows[dataIdx][4], marginToDate: rows[dataIdx][25] }
    const after = applyJobUpdate(ws, rows, dataIdx, rec)
    updated.push({ jobNumber: rec.jobNumber, jobName: rec.jobName, weekLabel, before, after })
  }

  const updatedJobNumbers = new Set(updated.map((u) => Number(u.jobNumber)))
  const notUpdated = [...existingJobNumbers].filter((n) => !updatedJobNumbers.has(n))

  writeWorkbook(wb, workbookPath)

  try {
    const meta = JSON.parse(readFileSync(syncMetaPath, 'utf8'))
    meta.updatedAt = new Date().toISOString()
    writeFileSync(syncMetaPath, JSON.stringify(meta, null, 2) + '\n')
  } catch {
    // sync-meta.json is optional; skip silently if it's not there.
  }

  console.log('\n=== Summary ===')
  console.log(`Updated ${updated.length} job(s):`)
  for (const u of updated) {
    const flag = u.after.marginToDate < 0 ? '  ⚠ NEGATIVE MARGIN' : u.after.marginToDate < 0.1 ? '  ⚠ thin margin' : ''
    console.log(
      `  ${u.jobNumber}  ${u.jobName.padEnd(45)} -> ${u.weekLabel.padEnd(13)} margin ${(u.before.marginToDate * 100).toFixed(1)}% -> ${(u.after.marginToDate * 100).toFixed(1)}%${flag}`,
    )
  }

  if (noRoomLeft.length > 0) {
    console.log(`\n${noRoomLeft.length} job(s) have no empty week slot left (Weeks 1-5 are all already filled in) — roll the month over first:`)
    console.log('  Move the current Week 5 figures up into that job\'s "Start of month" row, clear Weeks 1-5, then re-run.')
    for (const r of noRoomLeft) console.log(`  ${r.jobNumber}  ${r.jobName}`)
  }

  if (notUpdated.length > 0) {
    console.log(`\n${notUpdated.length} existing job(s) got no new data (no matching export found):`)
    for (const n of notUpdated) {
      const b = blocks.find((b) => Number(b.jobNumber) === n)
      console.log(`  ${n}  ${b?.jobName ?? ''}`)
    }
  }

  if (unmatchedFiles.length > 0) {
    console.log(`\n${unmatchedFiles.length} export file(s) had a job number not found in the workbook:`)
    for (const u of unmatchedFiles) console.log(`  ${u.jobNumber}  ${u.jobName}  (${u.file})`)
  }

  if (failures.length > 0) {
    console.log(`\n${failures.length} file(s) could not be read:`)
    for (const f of failures) console.log(`  ${f.file}: ${f.error}`)
  }

  const archived = archiveProcessedFiles(folder)
  if (archived) {
    console.log(`\nArchived ${archived.count} item(s) into ${archived.archiveDir}`)
    console.log(`${folder} is now empty and ready for next week's files.`)
  }

  console.log('\nWorkbook updated. Review the numbers above, then:')
  console.log('  git add Cassidy_Davies_Electrical_BPMN_Data.xlsx sync-meta.json')
  console.log('  git commit -m "Update job data"')
  console.log('  git push')
}

main()
