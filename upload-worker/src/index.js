import * as XLSX from 'xlsx'

const OWNER = 'felixkwan2901'
const REPO = 'excel-dashboard'
const FILE_PATH = 'Cassidy_Davies_Electrical_BPMN_Data.xlsx'
const SYNC_META_PATH = 'sync-meta.json'
const BRANCH = 'main'
const MAX_FILE_BYTES = 8 * 1024 * 1024 // 8MB per file
const MAX_FILES = 60

// ---------------------------------------------------------------------------
// Shared header/field helpers — mirrors src/lib/loadWorkbook.js and
// scripts/update-jobs.mjs (kept in sync manually since this worker runs
// isolated from the main app build).
// ---------------------------------------------------------------------------

function normalizeHeader(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function isValidJobRow(row) {
  const num = row[0]
  const name = row[1]
  return typeof num === 'number' && num > 0 && typeof name === 'string' && name.trim() !== '' && name.trim() !== '0'
}

// Several sheets in the workbook share a "Job Number" first column (e.g.
// "Main Sheet" is a checklist tab, not the costing tab) — only a sheet with
// the cost columns too (Quoted Price, Total actual cost) is the real
// Deliverables Sheet.
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
  if (!chosen) throw new Error('Could not find the Deliverables Sheet in the current workbook')
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

// Finds the row this update should land in: the next EMPTY week slot after
// whichever row currently holds data — advances Week 1, then Week 2, ... so
// week-by-week history is preserved instead of overwritten. Returns null if
// every week slot in the block already has data.
function pickTargetRowIdx(block, rows) {
  let lastFilledPos = 0
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

const COL = {
  quotedPrice: 3, claimToDate: 4, remainingToClaim: 5, pctClaimRemaining: 6,
  totalQuotedCost: 7, totalActualCost: 8, quotedMaterialCost: 9, actualMaterialCost: 10,
  materialCostRemaining: 11, materialPctRemaining: 12,
  quotedLabourCost: 14, actualLabourCost: 15, labourCostRemaining: 16, labourCostPctRemaining: 17,
  quotedLabourHours: 18, actualLabourHours: 19, labourHoursRemaining: 20, labourHourPctRemaining: 21,
  gpPerHour: 23, quotedGpPerHour: 24, marginToDate: 25, quotedMargin: 26,
}

// "Material" columns in this sheet are really "everything non-labour" —
// derived as a residual so the profit/margin formulas stay internally
// consistent with the sheet's own formulas.
function applyJobUpdate(ws, rows, dataIdx, rec) {
  const {
    quotedPrice, claimToDate, totalQuotedCost, totalActualCost,
    quotedLabourCost, actualLabourCost, quotedLabourHours, actualLabourHours,
    quotedProfit, quotedMargin, profitToDate, marginToDate,
  } = rec

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
// Per-job export extraction (Quotes + Summary sheets) — mirrors
// scripts/update-jobs.mjs's extractJobExport.
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

function extractJobExport(buffer, fileName) {
  const wb = XLSX.read(buffer, { type: 'array' })
  if (!wb.SheetNames.includes('Quotes') || !wb.SheetNames.includes('Summary')) {
    return { file: fileName, error: 'missing Quotes/Summary sheet (likely a blank export or a different report type)' }
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
  if (!baseRow) return { file: fileName, error: 'no job number found in Quotes sheet' }

  const jobNumber = String(baseRow[0]).trim()
  const jobName = String(baseRow[1]).trim()

  const summaryRows = XLSX.utils.sheet_to_json(wb.Sheets['Summary'], { header: 1, defval: '' })
  const rec = { file: fileName, jobNumber, jobName }

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
    return { file: fileName, jobNumber, jobName, error: `missing fields in Summary sheet: ${missing.join(', ')}` }
  }

  return rec
}

async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ---------------------------------------------------------------------------
// GitHub helpers
// ---------------------------------------------------------------------------

function arrayBufferToBase64(buffer) {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64.replace(/\n/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

function textToBase64(text) {
  return arrayBufferToBase64(new TextEncoder().encode(text))
}

async function githubRequest(path, env, init) {
  return fetch(`https://api.github.com/repos/${OWNER}/${REPO}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'cde-data-upload-worker',
      ...(init?.headers ?? {}),
    },
  })
}

async function getFileContent(path, env) {
  const res = await githubRequest(`contents/${path}?ref=${BRANCH}`, env)
  if (!res.ok) throw new Error(`Could not fetch ${path} from GitHub (${res.status})`)
  const json = await res.json()
  return { buffer: base64ToArrayBuffer(json.content), sha: json.sha }
}

// Writes a file's content, fetching its current sha first. If another
// commit lands on the branch between that fetch and this write, GitHub
// responds 409 — retry once with a freshly-fetched sha.
async function putFileWithRetry(path, env, { contentBase64, message, attempts = 2 }) {
  let lastRes
  for (let i = 0; i < attempts; i++) {
    const currentRes = await githubRequest(`contents/${path}?ref=${BRANCH}`, env)
    const sha = currentRes.ok ? (await currentRes.json()).sha : undefined

    lastRes = await githubRequest(`contents/${path}`, env, {
      method: 'PUT',
      body: JSON.stringify({ message, content: contentBase64, sha, branch: BRANCH }),
    })

    if (lastRes.ok || lastRes.status !== 409) return lastRes
  }
  return lastRes
}

// ---------------------------------------------------------------------------
// Page rendering
// ---------------------------------------------------------------------------

const PAGE_STYLE = `
  :root { color-scheme: dark; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #0a0a0a; color: #f2f2f0; font: 16px/1.5 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    padding: 20px;
  }
  .card {
    width: 100%; max-width: 480px; background: #121212; border: 1px solid rgba(242,242,240,0.12);
    border-radius: 12px; padding: 28px;
  }
  h1 { font-size: 18px; margin: 0 0 6px; }
  p.sub { color: #a8a8a4; font-size: 13px; margin: 0 0 24px; }
  label { display: block; font-size: 13px; color: #a8a8a4; margin: 16px 0 6px; }
  input[type="file"], input[type="password"] {
    width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 8px;
    border: 1px solid rgba(242,242,240,0.12); background: #191919; color: #f2f2f0; font: inherit; font-size: 13px;
  }
  button {
    margin-top: 22px; width: 100%; padding: 12px; border-radius: 8px; border: 0;
    background: #40b44a; color: #06210a; font: inherit; font-size: 14px; font-weight: 600; cursor: pointer;
  }
  button:hover { background: #4bc656; }
  .result { border-radius: 8px; padding: 14px 16px; font-size: 13px; margin-top: 20px; }
  .result.ok { background: rgba(12,163,12,0.16); color: #b7f0b7; }
  .result.err { background: rgba(230,103,103,0.16); color: #e66767; }
  .result ul { margin: 8px 0 0; padding-left: 18px; }
  .result li { margin: 2px 0; }
  .result .muted { color: #a8a8a4; }
  a { color: #40b44a; }
`

function renderForm(message) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Update job data — Cassidy-Davies Electrical</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
  <div class="card">
    <h1>Update job data</h1>
    <p class="sub">Choose this week's downloaded job P&amp;L exports (as many as you like) and enter the upload password. Each job's figures are merged in automatically and the dashboard updates within a couple of minutes.</p>
    ${message ?? ''}
    <form method="POST" action="/upload" enctype="multipart/form-data">
      <label for="password">Upload password</label>
      <input type="password" id="password" name="password" required />

      <label for="files">Job exports (.xlsx, select multiple)</label>
      <input type="file" id="files" name="files" accept=".xlsx" multiple required />

      <button type="submit">Upload &amp; merge</button>
    </form>
  </div>
</body>
</html>`
}

function html(body, status = 200) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

function renderResultHtml({ updated, noRoomLeft, notUpdated, unmatchedFiles, failures, duplicateCount, pushed }) {
  const pct = (n) => (typeof n === 'number' ? `${(n * 100).toFixed(1)}%` : '—')

  const parts = []
  parts.push(
    pushed
      ? `<div class="result ok">Merged ${updated.length} job(s) into the workbook. The dashboard will rebuild and go live in a couple of minutes — <a href="https://felixkwan2901.github.io/excel-dashboard/" target="_blank">check the site</a>.</div>`
      : `<div class="result err">Nothing was merged — none of the uploaded file(s) matched a job that had room for a new update. Nothing was sent to GitHub; the dashboard is unchanged. See below for why.</div>`
  )

  if (updated.length > 0) {
    parts.push(`<div class="result ok"><strong>Updated (${updated.length})</strong><ul>${updated
      .map((u) => {
        const flag = u.after.marginToDate < 0 ? ' ⚠ negative margin' : u.after.marginToDate < 0.1 ? ' ⚠ thin margin' : ''
        return `<li>${escapeHtml(u.jobNumber)} ${escapeHtml(u.jobName)} → ${escapeHtml(u.weekLabel)}, margin ${pct(u.before.marginToDate)} → ${pct(u.after.marginToDate)}${flag}</li>`
      })
      .join('')}</ul></div>`)
  }

  if (noRoomLeft.length > 0) {
    parts.push(`<div class="result err"><strong>No empty week slot left (${noRoomLeft.length})</strong> — roll these over first (move Week 5 up into "Start of month", clear Weeks 1-5), then re-upload:<ul>${noRoomLeft
      .map((r) => `<li>${escapeHtml(r.jobNumber)} ${escapeHtml(r.jobName)}</li>`)
      .join('')}</ul></div>`)
  }

  if (unmatchedFiles.length > 0) {
    parts.push(`<div class="result err"><strong>Job number not found in workbook (${unmatchedFiles.length})</strong><ul>${unmatchedFiles
      .map((u) => `<li>${escapeHtml(u.jobNumber)} ${escapeHtml(u.jobName)} (${escapeHtml(u.file)})</li>`)
      .join('')}</ul></div>`)
  }

  if (failures.length > 0) {
    parts.push(`<div class="result err"><strong>Could not read (${failures.length})</strong><ul>${failures
      .map((f) => `<li>${escapeHtml(f.file)}: ${escapeHtml(f.error)}</li>`)
      .join('')}</ul></div>`)
  }

  if (notUpdated.length > 0) {
    parts.push(`<div class="result"><strong class="muted">No new export this time (${notUpdated.length})</strong><ul class="muted">${notUpdated
      .map((n) => `<li>${escapeHtml(n.jobNumber)} ${escapeHtml(n.jobName)}</li>`)
      .join('')}</ul></div>`)
  }

  if (duplicateCount > 0) {
    parts.push(`<div class="result"><span class="muted">Skipped ${duplicateCount} exact duplicate file(s).</span></div>`)
  }

  return parts.join('')
}

// ---------------------------------------------------------------------------
// Upload handler
// ---------------------------------------------------------------------------

async function handleUpload(request, env) {
  const form = await request.formData()
  const password = form.get('password')

  if (!env.UPLOAD_PASSWORD || password !== env.UPLOAD_PASSWORD) {
    return html(renderForm(`<div class="result err">Wrong password. Please try again.</div>`), 401)
  }

  const files = form.getAll('files').filter((f) => f && typeof f !== 'string')

  if (files.length === 0) {
    return html(renderForm(`<div class="result err">No files were selected.</div>`), 400)
  }
  if (files.length > MAX_FILES) {
    return html(renderForm(`<div class="result err">Too many files at once (max ${MAX_FILES}).</div>`), 400)
  }
  for (const f of files) {
    if (!f.name.toLowerCase().endsWith('.xlsx')) {
      return html(renderForm(`<div class="result err">"${escapeHtml(f.name)}" isn't a .xlsx file.</div>`), 400)
    }
    if (f.size > MAX_FILE_BYTES) {
      return html(renderForm(`<div class="result err">"${escapeHtml(f.name)}" is too large (max 8MB per file).</div>`), 400)
    }
  }

  // Dedupe by exact content hash — the same export downloaded/saved twice
  // under different auto-generated filenames is common.
  const seenHashes = new Set()
  const uniqueBuffers = []
  let duplicateCount = 0
  for (const f of files) {
    const buffer = await f.arrayBuffer()
    const hash = await sha256Hex(buffer)
    if (seenHashes.has(hash)) {
      duplicateCount++
      continue
    }
    seenHashes.add(hash)
    uniqueBuffers.push({ name: f.name, buffer })
  }

  const extracted = []
  const failures = []
  for (const { name, buffer } of uniqueBuffers) {
    const rec = extractJobExport(buffer, name)
    if (rec.error) failures.push(rec)
    else extracted.push(rec)
  }

  let current
  try {
    current = await getFileContent(FILE_PATH, env)
  } catch (err) {
    return html(renderForm(`<div class="result err">Could not read the current workbook from GitHub: ${escapeHtml(String(err.message ?? err))}</div>`), 502)
  }

  const wb = XLSX.read(current.buffer, { type: 'array' })
  const { name: sheetName, rows, headerIdx } = findDeliverablesSheet(wb)
  const ws = wb.Sheets[sheetName]
  const blocks = buildJobBlocks(rows, headerIdx)
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

  if (updated.length === 0) {
    return html(
      renderForm(
        renderResultHtml({ updated, noRoomLeft, notUpdated: [], unmatchedFiles, failures, duplicateCount, pushed: false })
      ),
      400
    )
  }

  const updatedJobNumbers = new Set(updated.map((u) => Number(u.jobNumber)))
  const notUpdated = [...existingJobNumbers]
    .filter((n) => !updatedJobNumbers.has(n))
    .map((n) => ({ jobNumber: n, jobName: blocks.find((b) => Number(b.jobNumber) === n)?.jobName ?? '' }))

  const outputBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  const contentBase64 = arrayBufferToBase64(outputBuffer)

  const putRes = await putFileWithRetry(FILE_PATH, env, {
    contentBase64,
    message: `Update job data via upload form (${new Date().toISOString()})`,
  })

  if (!putRes.ok) {
    const body = await putRes.text()
    return html(
      renderForm(`<div class="result err">GitHub rejected the update (${putRes.status}). ${escapeHtml(body.slice(0, 200))}</div>`),
      502
    )
  }

  const uploadedAt = new Date().toISOString()
  try {
    await putFileWithRetry(SYNC_META_PATH, env, {
      contentBase64: textToBase64(JSON.stringify({ updatedAt: uploadedAt }, null, 2)),
      message: `Update sync timestamp (${uploadedAt})`,
    })
  } catch {
    // Non-critical: the dashboard just won't show a fresh "Last updated" time.
  }

  return html(renderForm(renderResultHtml({ updated, noRoomLeft, notUpdated, unmatchedFiles, failures, duplicateCount, pushed: true })))
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (request.method === 'GET' && url.pathname === '/') {
      return html(renderForm())
    }

    if (request.method === 'POST' && url.pathname === '/upload') {
      try {
        return await handleUpload(request, env)
      } catch (err) {
        return html(renderForm(`<div class="result err">Unexpected error: ${escapeHtml(String(err.message ?? err))}</div>`), 500)
      }
    }

    return new Response('Not found', { status: 404 })
  },
}
