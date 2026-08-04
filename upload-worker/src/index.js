import * as XLSX from 'xlsx'

const OWNER = 'felixkwan2901'
const REPO = 'excel-dashboard'
const FILE_PATH = 'Cassidy_Davies_Electrical_BPMN_Data.xlsx'
const SYNC_META_PATH = 'sync-meta.json'
const BRANCH = 'main'
const MAX_BYTES = 8 * 1024 * 1024 // 8MB

// Columns are located by header text, not position — mirrors
// src/lib/loadWorkbook.js (kept in sync manually since this worker runs
// isolated from the frontend build). The real headers have embedded
// newlines ("Job\nNumber"), so header matching normalizes whitespace.
const FIELD_HEADER_ALIASES = {
  jobNumber: ['Job Number'],
  jobName: ['Job Name'],
  quotedPrice: ['Quoted Price'],
  totalActualCost: ['Total actual cost'],
}

function normalizeHeader(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
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

// A row is a real job's summary row only if it has a positive job number
// and a real name — distinguishes it from "Week 1..5" snapshot rows (blank
// job number), the blank separator row between every job block, and the
// handful of junk rows in the sheet (job number 0, or a placeholder name).
function isValidJobRow(row) {
  const num = row[0]
  const name = row[1]
  return typeof num === 'number' && num > 0 && typeof name === 'string' && name.trim() !== '' && name.trim() !== '0'
}

// The job-costing data has moved to a different tab before (Sheet1 →
// "Deliverables Sheet" once already), and the workbook also carries a
// near-duplicate "…Test Sheet" tab with the same columns — so rather than
// hardcode a tab name, find whichever sheet actually has the job-costing
// header row (mirrors src/lib/loadWorkbook.js's findJobsSheet).
function findJobsSheetRows(workbook) {
  const candidates = []
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name]
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' })
    const headerIdx = rows.findIndex((row) => normalizeHeader(row[0]) === 'job number')
    if (headerIdx === -1) continue
    const columnMap = buildColumnMap(rows[headerIdx])
    if (columnMap.jobNumber === undefined || columnMap.quotedPrice === undefined) continue
    if (columnMap.totalActualCost === undefined) continue
    candidates.push({ name, rows, headerIdx })
  }
  const preferred = candidates.find((c) => !normalizeHeader(c.name).includes('test'))
  return preferred ?? candidates[0] ?? null
}

// Only used to sanity-check the upload and report a job count back to the
// person uploading — the dashboard itself re-parses the file independently
// (src/lib/loadWorkbook.js) once it's live.
function countValidJobs(buffer) {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const found = findJobsSheetRows(workbook)
  if (!found) return 0

  let count = 0
  for (let i = found.headerIdx + 1; i < found.rows.length; i++) {
    if (isValidJobRow(found.rows[i])) count++
  }
  return count
}

const PAGE_STYLE = `
  :root { color-scheme: dark; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #0a0a0a; color: #f2f2f0; font: 16px/1.5 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    padding: 20px;
  }
  .card {
    width: 100%; max-width: 420px; background: #121212; border: 1px solid rgba(242,242,240,0.12);
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
  .result.ok { background: rgba(12,163,12,0.16); color: #0ca30c; }
  .result.err { background: rgba(230,103,103,0.16); color: #e66767; }
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
    <p class="sub">Choose the updated Excel file and enter the upload password. The dashboard updates automatically within a couple of minutes.</p>
    ${message ?? ''}
    <form method="POST" action="/upload" enctype="multipart/form-data">
      <label for="password">Upload password</label>
      <input type="password" id="password" name="password" required />

      <label for="file">Excel file (.xlsx)</label>
      <input type="file" id="file" name="file" accept=".xlsx" required />

      <button type="submit">Upload</button>
    </form>
  </div>
</body>
</html>`
}

function html(body, status = 200) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

function arrayBufferToBase64(buffer) {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function textToBase64(text) {
  return arrayBufferToBase64(new TextEncoder().encode(text))
}

async function githubRequest(path, env, init) {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'cde-data-upload-worker',
      ...(init?.headers ?? {}),
    },
  })
  return res
}

// Writes a file's content, fetching its current sha first. If another
// commit lands on the branch between that fetch and this write (e.g. a
// second upload, or unrelated repo activity), GitHub responds 409 — retry
// once with a freshly-fetched sha rather than surfacing a raw conflict.
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

async function handleUpload(request, env) {
  const form = await request.formData()
  const password = form.get('password')
  const file = form.get('file')

  if (!env.UPLOAD_PASSWORD || password !== env.UPLOAD_PASSWORD) {
    return html(renderForm(`<div class="result err">Wrong password. Please try again.</div>`), 401)
  }

  if (!file || typeof file === 'string') {
    return html(renderForm(`<div class="result err">No file was selected.</div>`), 400)
  }

  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    return html(renderForm(`<div class="result err">Please upload a .xlsx file.</div>`), 400)
  }

  if (file.size > MAX_BYTES) {
    return html(renderForm(`<div class="result err">That file is too large (max 8MB).</div>`), 400)
  }

  const buffer = await file.arrayBuffer()
  const contentBase64 = arrayBufferToBase64(buffer)

  const putRes = await putFileWithRetry(FILE_PATH, env, {
    contentBase64,
    message: `Update job data via upload form (${new Date().toISOString()})`,
  })

  if (!putRes.ok) {
    const body = await putRes.text()
    return html(
      renderForm(`<div class="result err">GitHub rejected the update (${putRes.status}). ${body.slice(0, 200)}</div>`),
      502
    )
  }

  const uploadedAt = new Date().toISOString()

  // Best-effort: the data upload above has already succeeded, so a
  // sync-meta write failure shouldn't fail the whole request.
  try {
    await putFileWithRetry(SYNC_META_PATH, env, {
      contentBase64: textToBase64(JSON.stringify({ updatedAt: uploadedAt }, null, 2)),
      message: `Update sync timestamp (${uploadedAt})`,
    })
  } catch {
    // Non-critical: the dashboard just won't show a fresh "Last updated" time.
  }

  let jobCountNote = ''
  try {
    const jobCount = countValidJobs(buffer)
    jobCountNote = ` Found ${jobCount} job${jobCount === 1 ? '' : 's'}.`
  } catch (err) {
    jobCountNote = ` (Couldn't verify the job count: ${String(err.message ?? err).slice(0, 150)})`
  }

  return html(
    renderForm(
      `<div class="result ok">Uploaded.${jobCountNote} The dashboard will rebuild and go live in a couple of minutes — <a href="https://felixkwan2901.github.io/excel-dashboard/" target="_blank">check the site</a>.</div>`
    )
  )
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
        return html(renderForm(`<div class="result err">Unexpected error: ${String(err.message ?? err)}</div>`), 500)
      }
    }

    return new Response('Not found', { status: 404 })
  },
}
