import * as XLSX from 'xlsx'
import workbookUrl from '../../Cassidy_Davies_Electrical_BPMN_Data.xlsx?url'
import aiChecksUrl from '../../ai-checks.json?url'

// Columns are located by header text, not position — the sheet has already
// had columns added/removed/renamed by hand once, which silently scrambled
// every field after the change point when this was position-based. Listing
// a few accepted aliases per field lets the sheet's layout drift a bit
// without breaking. "AI Check Status" is kept as a fallback alias for
// approvalStatus because an earlier edit repurposed that column for it —
// the real AI check now comes entirely from ai-checks.json instead.
const FIELD_HEADER_ALIASES = {
  jobId: ['Job ID'],
  client: ['Client Name'],
  serviceType: ['Service Type'],
  category: ['Job Category'],
  createdAt: ['Creation Date'],
  approvalStatus: ['Approval Status', 'AI Check Status'],
  tech: ['Assigned Tech'],
  value: ['Est. Value ($)', 'Est. Value'],
}

function normalizeHeader(text) {
  return String(text ?? '').trim().toLowerCase()
}

function sheetRows(sheet) {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' })
}

function buildColumnMap(headerRow) {
  const normalized = headerRow.map(normalizeHeader)
  const columnMap = {}
  for (const [field, aliases] of Object.entries(FIELD_HEADER_ALIASES)) {
    const col = aliases.map((alias) => normalized.indexOf(normalizeHeader(alias))).find((idx) => idx !== -1)
    if (col !== undefined && col !== -1) columnMap[field] = col
  }
  return columnMap
}

function rowsAfterHeader(rows) {
  const headerIdx = rows.findIndex((row) => normalizeHeader(row[0]) === 'job id')
  if (headerIdx === -1) return []
  const columnMap = buildColumnMap(rows[headerIdx])

  const out = []
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    // Stop at the sheet's totals row (e.g. "Total Pipeline Value") — it fills
    // column A but leaves the rest blank, unlike a real data row.
    if (!row[0] || !row[1]) break
    const record = {}
    for (const field of Object.keys(FIELD_HEADER_ALIASES)) {
      const col = columnMap[field]
      record[field] = col !== undefined ? (row[col] ?? '') : ''
    }
    out.push(record)
  }
  return out
}

async function loadAiChecks() {
  try {
    const res = await fetch(aiChecksUrl)
    if (!res.ok) return {}
    return await res.json()
  } catch {
    return {}
  }
}

export async function loadWorkbook() {
  const [buffer, aiChecks] = await Promise.all([
    fetch(workbookUrl).then((res) => res.arrayBuffer()),
    loadAiChecks(),
  ])
  const workbook = XLSX.read(buffer, { type: 'array' })

  const jobRows = sheetRows(workbook.Sheets['Job Directory'])
  const jobs = rowsAfterHeader(jobRows).map((job) => {
    const aiCheck = aiChecks[job.jobId]
    return {
      ...job,
      value: Number(job.value) || 0,
      aiStatus: aiCheck?.aiStatus ?? '',
      aiReason: aiCheck?.aiReason ?? '',
    }
  })

  return { jobs }
}
