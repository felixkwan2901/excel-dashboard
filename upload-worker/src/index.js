import * as XLSX from 'xlsx'

const OWNER = 'felixkwan2901'
const REPO = 'excel-dashboard'
const FILE_PATH = 'Cassidy_Davies_Electrical_BPMN_Data.xlsx'
const AI_CHECKS_PATH = 'ai-checks.json'
const BRANCH = 'main'
const MAX_BYTES = 8 * 1024 * 1024 // 8MB

// Columns are located by header text, not position — mirrors
// src/lib/loadWorkbook.js (kept in sync manually since this worker runs
// isolated from the frontend build). A prior sheet edit removed some
// columns entirely, which silently scrambled every field after the change
// point under the old position-based parsing.
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

function buildColumnMap(headerRow) {
  const normalized = headerRow.map(normalizeHeader)
  const columnMap = {}
  for (const [field, aliases] of Object.entries(FIELD_HEADER_ALIASES)) {
    const col = aliases.map((alias) => normalized.indexOf(normalizeHeader(alias))).find((idx) => idx !== -1)
    if (col !== undefined && col !== -1) columnMap[field] = col
  }
  return columnMap
}

function parseJobs(buffer) {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheet = workbook.Sheets['Job Directory']
  if (!sheet) return []

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' })
  const headerIdx = rows.findIndex((row) => normalizeHeader(row[0]) === 'job id')
  if (headerIdx === -1) return []
  const columnMap = buildColumnMap(rows[headerIdx])

  const jobs = []
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row[0] || !row[1]) break
    const record = {}
    for (const field of Object.keys(FIELD_HEADER_ALIASES)) {
      const col = columnMap[field]
      record[field] = col !== undefined ? (row[col] ?? '') : ''
    }
    jobs.push(record)
  }
  return jobs
}

async function runAiChecks(jobs, env) {
  if (!env.GEMINI_API_KEY || jobs.length === 0) return {}

  const prompt = `You are a compliance reviewer for an electrical contracting company's job pipeline.
For each job below, decide if it should be "Passed" or "Flagged" for manual review, and give a short reason (under 12 words).
Flag jobs that look risky or inconsistent — e.g. no technician assigned, unusually high value for the job category, or a value/approval mismatch. Otherwise pass them.

Jobs (JSON):
${JSON.stringify(
  jobs.map((j) => ({
    jobId: j.jobId,
    category: j.category,
    serviceType: j.serviceType,
    tech: j.tech,
    value: j.value,
    approvalStatus: j.approvalStatus,
  }))
)}

Respond with ONLY a JSON array, one entry per job, in this exact shape:
[{"jobId": "CDE-2026-001", "aiStatus": "Passed", "aiReason": "Short reason here"}]`

  const res = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    }
  )

  if (!res.ok) {
    throw new Error(`Gemini request failed (${res.status}): ${(await res.text()).slice(0, 300)}`)
  }

  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini returned no content')

  const results = JSON.parse(text)
  const byJobId = {}
  for (const r of results) {
    if (!r.jobId) continue
    byJobId[r.jobId] = {
      aiStatus: r.aiStatus === 'Flagged' ? 'Flagged' : 'Passed',
      aiReason: String(r.aiReason ?? '').slice(0, 160),
    }
  }
  return byJobId
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

  // AI checks are best-effort: if this fails (bad key, quota, malformed
  // response), the data upload above has already succeeded — don't block
  // on it, just skip refreshing the AI check results this time.
  let aiNote = ''
  try {
    const jobs = parseJobs(buffer)
    const aiChecks = await runAiChecks(jobs, env)

    if (Object.keys(aiChecks).length > 0) {
      const aiPutRes = await putFileWithRetry(AI_CHECKS_PATH, env, {
        contentBase64: textToBase64(JSON.stringify(aiChecks, null, 2)),
        message: `Refresh AI job checks (${new Date().toISOString()})`,
      })

      aiNote = aiPutRes.ok
        ? ` AI reviewed ${Object.keys(aiChecks).length} jobs.`
        : ' (AI check ran, but saving the results failed.)'
    }
  } catch (err) {
    aiNote = ` (Skipped AI check: ${String(err.message ?? err).slice(0, 150)})`
  }

  return html(
    renderForm(
      `<div class="result ok">Uploaded.${aiNote} The dashboard will rebuild and go live in a couple of minutes — <a href="https://felixkwan2901.github.io/excel-dashboard/" target="_blank">check the site</a>.</div>`
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
