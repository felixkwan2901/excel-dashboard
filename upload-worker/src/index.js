// This worker does NOT parse or write the Excel file itself — it only
// stages the raw request (files or edits) as a commit under
// pending-updates/, then a GitHub Actions workflow
// (.github/workflows/process-pending-updates.yml, triggered by that push)
// does the actual ExcelJS work on a full runner with no CPU-time limit.
// Cloudflare Workers' free plan caps CPU time at 10ms per request, which
// ExcelJS's parsing easily exceeded for a workbook this size — that's what
// used to crash /health and put /upload and /replace at the same risk.
// The tradeoff: results are no longer instant — the browser has to poll
// /status until the staged request has been processed.

const OWNER = 'felixkwan2901'
const REPO = 'excel-dashboard'
// Lives in public/ (not the repo root) so it's a stable, unhashed static
// asset the site fetches directly — see loadWorkbook.js for why.
const FILE_NAME = 'Cassidy_Davies_Electrical_BPMN_Data.xlsx'
const FILE_PATH = `public/${FILE_NAME}`
const BRANCH = 'main'
const MAX_FILE_BYTES = 8 * 1024 * 1024 // 8MB per file
const MAX_FILES = 60

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

function textToBase64(text) {
  return arrayBufferToBase64(new TextEncoder().encode(text))
}

async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
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

// GitHub's Contents API omits the JSON `content` field entirely for files
// over 1MB — the raw media type bypasses that JSON/base64 wrapper and
// streams the actual file bytes directly, with no such size cap.
async function getFileBuffer(path, env) {
  const res = await githubRequest(`contents/${path}?ref=${BRANCH}`, env, {
    headers: { Accept: 'application/vnd.github.raw+json' },
  })
  if (!res.ok) throw new Error(`Could not fetch ${path} from GitHub (${res.status})`)
  return res.arrayBuffer()
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

function safeFileName(name) {
  return String(name ?? 'file').replace(/[^a-zA-Z0-9._-]/g, '_')
}

function stagedId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
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
  .stack { width: 100%; max-width: 480px; display: flex; flex-direction: column; gap: 20px; }
  .card {
    width: 100%; background: #121212; border: 1px solid rgba(242,242,240,0.12);
    border-radius: 12px; padding: 28px;
  }
  h1 { font-size: 18px; margin: 0 0 6px; }
  p.sub { color: #a8a8a4; font-size: 13px; margin: 0 0 24px; }
  label { display: block; font-size: 13px; color: #a8a8a4; margin: 16px 0 6px; }
  input[type="file"] {
    width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 8px;
    border: 1px solid rgba(242,242,240,0.12); background: #191919; color: #f2f2f0; font: inherit; font-size: 13px;
  }
  .checkbox-label { display: flex; align-items: flex-start; gap: 8px; margin-top: 16px; font-size: 12.5px; }
  .checkbox-label input { margin-top: 2px; }
  button {
    margin-top: 22px; width: 100%; padding: 12px; border-radius: 8px; border: 0;
    background: #40b44a; color: #06210a; font: inherit; font-size: 14px; font-weight: 600; cursor: pointer;
  }
  button:hover { background: #4bc656; }
  button.secondary { background: transparent; border: 1px solid rgba(242,242,240,0.2); color: #f2f2f0; }
  button.secondary:hover { background: rgba(242,242,240,0.06); }
  .result { border-radius: 8px; padding: 14px 16px; font-size: 13px; margin-top: 20px; }
  .result.ok { background: rgba(12,163,12,0.16); color: #b7f0b7; }
  .result.err { background: rgba(230,103,103,0.16); color: #e66767; }
  .result ul { margin: 8px 0 0; padding-left: 18px; }
  .result li { margin: 2px 0; }
  .result .muted { color: #a8a8a4; }
  a { color: #40b44a; }
  .download-link { display: block; text-align: center; margin-top: 18px; font-size: 13px; }
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
  <div class="stack">
    ${message ?? ''}

    <div class="card">
      <h1>Replace with an edited file</h1>
      <form method="POST" action="/replace" enctype="multipart/form-data">
        <label for="replace-file">Edited workbook (.xlsx)</label>
        <input type="file" id="replace-file" name="file" accept=".xlsx" required />

        <label class="checkbox-label">
          <input type="checkbox" required />
          Replaces the entire workbook
        </label>

        <button type="submit" class="secondary">Replace workbook</button>
      </form>
    </div>

    <div class="card">
      <h1>Update job data</h1>
      <form method="POST" action="/upload" enctype="multipart/form-data">
        <label for="files">Job exports (.xlsx, select multiple)</label>
        <input type="file" id="files" name="files" accept=".xlsx" multiple required />

        <button type="submit">Upload &amp; merge</button>
      </form>
    </div>

    <div class="card">
      <a class="download-link" href="/download">Download the current workbook</a>
    </div>
  </div>
</body>
</html>`
}

// Allows the dashboard site (a different origin) to call this worker
// directly via fetch(), in addition to the worker's own HTML form.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
}

function html(body, status = 200) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', ...CORS_HEADERS } })
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

function wantsJsonResponse(request) {
  return (request.headers.get('Accept') || '').includes('application/json')
}

// Renders either an HTML page (default, for the worker's own form) or a
// plain JSON payload (for the dashboard's own pages, which render their
// own UI) depending on the request's Accept header.
function respond(request, status, { htmlMessage, data }) {
  if (wantsJsonResponse(request)) {
    return json({ ok: status < 400, status, ...data }, status)
  }
  return html(renderForm(htmlMessage), status)
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

// ---------------------------------------------------------------------------
// /upload — stage each unique job export under pending-updates/exports/
// ---------------------------------------------------------------------------

async function handleUpload(request, env) {
  const form = await request.formData()

  const files = form.getAll('files').filter((f) => f && typeof f !== 'string')

  if (files.length === 0) {
    return respond(request, 400, { htmlMessage: `<div class="result err">No files were selected.</div>`, data: { error: 'no_files', message: 'No files were selected.' } })
  }
  if (files.length > MAX_FILES) {
    return respond(request, 400, {
      htmlMessage: `<div class="result err">Too many files at once (max ${MAX_FILES}).</div>`,
      data: { error: 'too_many_files', message: `Too many files at once (max ${MAX_FILES}).` },
    })
  }
  for (const f of files) {
    if (!f.name.toLowerCase().endsWith('.xlsx')) {
      return respond(request, 400, {
        htmlMessage: `<div class="result err">"${escapeHtml(f.name)}" isn't a .xlsx file.</div>`,
        data: { error: 'bad_file_type', message: `"${f.name}" isn't a .xlsx file.` },
      })
    }
    if (f.size > MAX_FILE_BYTES) {
      return respond(request, 400, {
        htmlMessage: `<div class="result err">"${escapeHtml(f.name)}" is too large (max 8MB per file).</div>`,
        data: { error: 'file_too_large', message: `"${f.name}" is too large (max 8MB per file).` },
      })
    }
  }

  // Dedupe by exact content hash — the same export downloaded/saved twice
  // under different auto-generated filenames is common. (Cross-batch
  // duplicate detection — same job's figures unchanged from what's already
  // recorded — now happens in scripts/update-jobs.mjs once this batch is
  // actually processed, not here.)
  const seenHashes = new Set()
  const staged = []
  let duplicateCount = 0

  for (const f of files) {
    const buffer = await f.arrayBuffer()
    const hash = await sha256Hex(buffer)
    if (seenHashes.has(hash)) {
      duplicateCount++
      continue
    }
    seenHashes.add(hash)

    const stagedPath = `pending-updates/exports/${stagedId()}-${safeFileName(f.name)}`
    const putRes = await putFileWithRetry(stagedPath, env, {
      contentBase64: arrayBufferToBase64(buffer),
      message: `Stage job export: ${f.name}`,
    })
    if (!putRes.ok) {
      const body = await putRes.text()
      const msg = `GitHub rejected staging "${f.name}" (${putRes.status}). ${body.slice(0, 200)}`
      return respond(request, 502, { htmlMessage: `<div class="result err">${escapeHtml(msg)}</div>`, data: { error: 'github_write_failed', message: msg } })
    }
    staged.push(stagedPath)
  }

  if (staged.length === 0) {
    const msg = `All ${files.length} file(s) were exact duplicates of each other — nothing new to stage.`
    return respond(request, 400, { htmlMessage: `<div class="result err">${escapeHtml(msg)}</div>`, data: { error: 'all_duplicates', message: msg, duplicateCount } })
  }

  const msg = `Queued ${staged.length} file(s) for processing${duplicateCount ? ` (skipped ${duplicateCount} duplicate(s))` : ''}. Merging usually takes 30-90 seconds, then the site takes another minute or so to redeploy before the change is actually visible live.`
  return respond(request, 200, {
    htmlMessage: `<div class="result ok">${escapeHtml(msg)}</div>`,
    data: { queued: true, staged, duplicateCount, message: msg },
  })
}

// ---------------------------------------------------------------------------
// /upload-from-url — for automation (e.g. Zapier) rather than a browser
// form: the caller can't attach a file to a JSON webhook body, but Katipult
// exports (via Zapier) hand out a temporary download URL for the report
// instead — the worker fetches that URL itself server-side and stages the
// result exactly like a normal /upload, so it merges through the same
// pipeline (scripts/update-jobs.mjs) with no special-casing downstream.
// ---------------------------------------------------------------------------

async function handleUploadFromUrl(request, env) {
  let body
  try {
    body = await request.json()
  } catch {
    return json({ error: 'bad_json', message: 'Request body must be JSON.' }, 400)
  }

  const { url: fileUrl, filename } = body ?? {}

  if (typeof fileUrl !== 'string' || !/^https?:\/\//i.test(fileUrl)) {
    return json({ error: 'bad_url', message: '"url" must be an http(s) URL to the report file.' }, 400)
  }

  const resolvedName = safeFileName(filename || new URL(fileUrl).pathname.split('/').pop() || 'export.xlsx')
  if (!resolvedName.toLowerCase().endsWith('.xlsx')) {
    return json({ error: 'bad_file_type', message: `"${resolvedName}" isn't a .xlsx file — pass a "filename" ending in .xlsx if the URL itself doesn't have one.` }, 400)
  }

  let fileRes
  try {
    fileRes = await fetch(fileUrl)
  } catch (err) {
    return json({ error: 'fetch_failed', message: `Could not fetch the file URL: ${String(err.message ?? err)}` }, 502)
  }
  if (!fileRes.ok) {
    return json({ error: 'fetch_failed', message: `Fetching the file URL returned ${fileRes.status}.` }, 502)
  }

  const buffer = await fileRes.arrayBuffer()
  if (buffer.byteLength === 0) {
    return json({ error: 'empty_file', message: 'The fetched file was empty.' }, 400)
  }
  if (buffer.byteLength > MAX_FILE_BYTES) {
    return json({ error: 'file_too_large', message: `Fetched file is too large (max 8MB).` }, 400)
  }

  const stagedPath = `pending-updates/exports/${stagedId()}-${resolvedName}`
  const putRes = await putFileWithRetry(stagedPath, env, {
    contentBase64: arrayBufferToBase64(buffer),
    message: `Stage job export (via automation): ${resolvedName}`,
  })
  if (!putRes.ok) {
    const errBody = await putRes.text()
    return json({ error: 'github_write_failed', message: `GitHub rejected staging "${resolvedName}" (${putRes.status}). ${errBody.slice(0, 200)}` }, 502)
  }

  const msg = `Queued "${resolvedName}" for processing. Merging usually takes 30-90 seconds, then the site takes another minute or so to redeploy.`
  return json({ queued: true, staged: [stagedPath], message: msg })
}

// ---------------------------------------------------------------------------
// /replace — stage the uploaded workbook under pending-updates/replace/
// ---------------------------------------------------------------------------

async function handleReplace(request, env) {
  const form = await request.formData()

  const file = form.get('file')
  if (!file || typeof file === 'string') {
    return respond(request, 400, { htmlMessage: `<div class="result err">No file was selected.</div>`, data: { error: 'no_file', message: 'No file was selected.' } })
  }
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    return respond(request, 400, { htmlMessage: `<div class="result err">"${escapeHtml(file.name)}" isn't a .xlsx file.</div>`, data: { error: 'bad_file_type', message: `"${file.name}" isn't a .xlsx file.` } })
  }
  if (file.size > MAX_FILE_BYTES) {
    return respond(request, 400, { htmlMessage: `<div class="result err">That file is too large (max 8MB).</div>`, data: { error: 'file_too_large', message: 'That file is too large (max 8MB).' } })
  }

  const buffer = await file.arrayBuffer()
  const stagedPath = `pending-updates/replace/${stagedId()}-${safeFileName(file.name)}`

  const putRes = await putFileWithRetry(stagedPath, env, {
    contentBase64: arrayBufferToBase64(buffer),
    message: `Stage workbook replacement: ${file.name}`,
  })
  if (!putRes.ok) {
    const body = await putRes.text()
    const msg = `GitHub rejected the upload (${putRes.status}). ${body.slice(0, 200)}`
    return respond(request, 502, { htmlMessage: `<div class="result err">${escapeHtml(msg)}</div>`, data: { error: 'github_write_failed', message: msg } })
  }

  const msg = 'Queued your file for validation and replacement. Merging usually takes 30-90 seconds, then the site takes another minute or so to redeploy before the change is actually visible live.'
  return respond(request, 200, {
    htmlMessage: `<div class="result ok">${escapeHtml(msg)}</div>`,
    data: { queued: true, staged: stagedPath, message: msg },
  })
}

// ---------------------------------------------------------------------------
// /main-sheet — stage checklist edits under pending-updates/main-sheet/
// ---------------------------------------------------------------------------

async function handleMainSheetUpdate(request, env) {
  const body = await request.json().catch(() => null)
  if (!body) {
    return respond(request, 400, { htmlMessage: `<div class="result err">Invalid request body.</div>`, data: { error: 'bad_request', message: 'Invalid request body.' } })
  }
  const { edits } = body
  if (!Array.isArray(edits) || edits.length === 0) {
    return respond(request, 400, { htmlMessage: `<div class="result err">No changes to save.</div>`, data: { error: 'no_edits', message: 'No changes to save.' } })
  }

  const stagedPath = `pending-updates/main-sheet/${stagedId()}.json`
  const putRes = await putFileWithRetry(stagedPath, env, {
    contentBase64: textToBase64(JSON.stringify({ edits, stagedAt: new Date().toISOString() }, null, 2)),
    message: `Stage checklist edit(s) (${edits.length})`,
  })
  if (!putRes.ok) {
    const body2 = await putRes.text()
    const msg = `GitHub rejected the save (${putRes.status}). ${body2.slice(0, 200)}`
    return respond(request, 502, { htmlMessage: `<div class="result err">${escapeHtml(msg)}</div>`, data: { error: 'github_write_failed', message: msg } })
  }

  const msg = `Queued ${edits.length} change(s). Merging usually takes 30-90 seconds, then the site takes another minute or so to redeploy before it's visible live.`
  return respond(request, 200, {
    htmlMessage: `<div class="result ok">${escapeHtml(msg)}</div>`,
    data: { queued: true, staged: stagedPath, message: msg },
  })
}

// ---------------------------------------------------------------------------
// /archive-job — stage an archive/un-archive request under
// pending-updates/archived-jobs/
// ---------------------------------------------------------------------------

async function handleArchiveJob(request, env) {
  const body = await request.json().catch(() => null)
  if (!body) {
    return respond(request, 400, { htmlMessage: `<div class="result err">Invalid request body.</div>`, data: { error: 'bad_request', message: 'Invalid request body.' } })
  }
  const { jobNumber, action } = body
  if (!jobNumber || (action !== 'archive' && action !== 'unarchive')) {
    return respond(request, 400, { htmlMessage: `<div class="result err">Invalid request.</div>`, data: { error: 'bad_request', message: 'Invalid request.' } })
  }

  const stagedPath = `pending-updates/archived-jobs/${stagedId()}.json`
  const putRes = await putFileWithRetry(stagedPath, env, {
    contentBase64: textToBase64(JSON.stringify({ jobNumber: String(jobNumber), action, stagedAt: new Date().toISOString() }, null, 2)),
    message: `Stage ${action}: ${jobNumber}`,
  })
  if (!putRes.ok) {
    const body2 = await putRes.text()
    const msg = `GitHub rejected the save (${putRes.status}). ${body2.slice(0, 200)}`
    return respond(request, 502, { htmlMessage: `<div class="result err">${escapeHtml(msg)}</div>`, data: { error: 'github_write_failed', message: msg } })
  }

  const msg = `Queued. Takes 30-90 seconds, then the site takes another minute or so to redeploy before it's visible live.`
  return respond(request, 200, {
    htmlMessage: `<div class="result ok">${escapeHtml(msg)}</div>`,
    data: { queued: true, staged: stagedPath, message: msg },
  })
}

// ---------------------------------------------------------------------------
// /new-job — stage a new-job request under pending-updates/new-job/
// ---------------------------------------------------------------------------

async function handleNewJob(request, env) {
  const body = await request.json().catch(() => null)
  if (!body) {
    return respond(request, 400, { htmlMessage: `<div class="result err">Invalid request body.</div>`, data: { error: 'bad_request', message: 'Invalid request body.' } })
  }
  const { jobNumber, jobName, jobOwner, quotedPrice, quotedMaterialCost, quotedLabourCost, quotedLabourHours } = body
  if (!jobNumber || !Number.isFinite(Number(jobNumber)) || Number(jobNumber) <= 0) {
    return respond(request, 400, { htmlMessage: `<div class="result err">Job number must be a positive number.</div>`, data: { error: 'bad_request', message: 'Job number must be a positive number.' } })
  }
  if (!jobName || typeof jobName !== 'string') {
    return respond(request, 400, { htmlMessage: `<div class="result err">Job name is required.</div>`, data: { error: 'bad_request', message: 'Job name is required.' } })
  }

  const stagedPath = `pending-updates/new-job/${stagedId()}.json`
  const putRes = await putFileWithRetry(stagedPath, env, {
    contentBase64: textToBase64(JSON.stringify({
      jobNumber: String(jobNumber),
      jobName: String(jobName),
      jobOwner: String(jobOwner ?? ''),
      quotedPrice: Number(quotedPrice) || 0,
      quotedMaterialCost: Number(quotedMaterialCost) || 0,
      quotedLabourCost: Number(quotedLabourCost) || 0,
      quotedLabourHours: Number(quotedLabourHours) || 0,
      stagedAt: new Date().toISOString(),
    }, null, 2)),
    message: `Stage new job: ${jobNumber} ${jobName}`,
  })
  if (!putRes.ok) {
    const body2 = await putRes.text()
    const msg = `GitHub rejected the save (${putRes.status}). ${body2.slice(0, 200)}`
    return respond(request, 502, { htmlMessage: `<div class="result err">${escapeHtml(msg)}</div>`, data: { error: 'github_write_failed', message: msg } })
  }

  const msg = `Queued. Adding a job to every linked sheet takes 30-90 seconds, then the site takes another minute or so to redeploy before it's visible live.`
  return respond(request, 200, {
    htmlMessage: `<div class="result ok">${escapeHtml(msg)}</div>`,
    data: { queued: true, staged: stagedPath, message: msg },
  })
}

// ---------------------------------------------------------------------------
// /claim-calculator — stage Claim Calculator edits under
// pending-updates/claim-calculator/
// ---------------------------------------------------------------------------

async function handleClaimCalculatorUpdate(request, env) {
  const body = await request.json().catch(() => null)
  if (!body) {
    return respond(request, 400, { htmlMessage: `<div class="result err">Invalid request body.</div>`, data: { error: 'bad_request', message: 'Invalid request body.' } })
  }
  const { edits } = body
  if (!Array.isArray(edits) || edits.length === 0) {
    return respond(request, 400, { htmlMessage: `<div class="result err">No changes to save.</div>`, data: { error: 'no_edits', message: 'No changes to save.' } })
  }

  const stagedPath = `pending-updates/claim-calculator/${stagedId()}.json`
  const putRes = await putFileWithRetry(stagedPath, env, {
    contentBase64: textToBase64(JSON.stringify({ edits, stagedAt: new Date().toISOString() }, null, 2)),
    message: `Stage Claim Calculator edit(s) (${edits.length})`,
  })
  if (!putRes.ok) {
    const body2 = await putRes.text()
    const msg = `GitHub rejected the save (${putRes.status}). ${body2.slice(0, 200)}`
    return respond(request, 502, { htmlMessage: `<div class="result err">${escapeHtml(msg)}</div>`, data: { error: 'github_write_failed', message: msg } })
  }

  const msg = `Queued ${edits.length} change(s). Merging usually takes 30-90 seconds, then the site takes another minute or so to redeploy before it's visible live.`
  return respond(request, 200, {
    htmlMessage: `<div class="result ok">${escapeHtml(msg)}</div>`,
    data: { queued: true, staged: stagedPath, message: msg },
  })
}

// ---------------------------------------------------------------------------
// /upcoming-work — stage Upcoming Work Calculator edits under
// pending-updates/upcoming-work/
// ---------------------------------------------------------------------------

async function handleUpcomingWorkUpdate(request, env) {
  const body = await request.json().catch(() => null)
  if (!body) {
    return respond(request, 400, { htmlMessage: `<div class="result err">Invalid request body.</div>`, data: { error: 'bad_request', message: 'Invalid request body.' } })
  }
  const { edits } = body
  if (!Array.isArray(edits) || edits.length === 0) {
    return respond(request, 400, { htmlMessage: `<div class="result err">No changes to save.</div>`, data: { error: 'no_edits', message: 'No changes to save.' } })
  }

  const stagedPath = `pending-updates/upcoming-work/${stagedId()}.json`
  const putRes = await putFileWithRetry(stagedPath, env, {
    contentBase64: textToBase64(JSON.stringify({ edits, stagedAt: new Date().toISOString() }, null, 2)),
    message: `Stage Upcoming Work edit(s) (${edits.length})`,
  })
  if (!putRes.ok) {
    const body2 = await putRes.text()
    const msg = `GitHub rejected the save (${putRes.status}). ${body2.slice(0, 200)}`
    return respond(request, 502, { htmlMessage: `<div class="result err">${escapeHtml(msg)}</div>`, data: { error: 'github_write_failed', message: msg } })
  }

  const msg = `Queued ${edits.length} change(s). Merging usually takes 30-90 seconds, then the site takes another minute or so to redeploy before it's visible live.`
  return respond(request, 200, {
    htmlMessage: `<div class="result ok">${escapeHtml(msg)}</div>`,
    data: { queued: true, staged: stagedPath, message: msg },
  })
}

// ---------------------------------------------------------------------------
// /status — poll whether a staged request has been processed yet
// ---------------------------------------------------------------------------

async function handleStatus(request, env) {
  const url = new URL(request.url)
  const path = url.searchParams.get('path')
  if (!path || !path.startsWith('pending-updates/')) {
    return json({ status: 'error', message: 'Missing or invalid "path" query parameter.' }, 400)
  }

  const stillStaged = await githubRequest(`contents/${path}?ref=${BRANCH}`, env)
  if (stillStaged.ok) {
    return json({ status: 'pending' })
  }

  const baseName = path.split('/').pop()
  const failedPath = `pending-updates/failed/${baseName}`
  const failedRes = await githubRequest(`contents/${failedPath}?ref=${BRANCH}`, env)
  if (failedRes.ok) {
    let message = 'Failed to process — see the repo for details.'
    try {
      const errBuf = await getFileBuffer(`${failedPath}.error.json`, env)
      const parsed = JSON.parse(new TextDecoder().decode(errBuf))
      if (parsed?.message) message = parsed.message
    } catch {
      // Best-effort — fall back to the generic message above.
    }
    return json({ status: 'failed', message })
  }

  // scripts/update-jobs.mjs writes a per-job result alongside the workbook
  // commit once it's done processing this file — best-effort: an older
  // upload from before this existed, or the results file racing the
  // "gone from exports/" check by a beat, just means a plain "done" with
  // no extra detail rather than an error.
  const resultPath = `pending-updates/results/${baseName}.json`
  try {
    const resultBuf = await getFileBuffer(resultPath, env)
    const result = JSON.parse(new TextDecoder().decode(resultBuf))
    return json({ status: 'done', result })
  } catch {
    return json({ status: 'done' })
  }
}

// ---------------------------------------------------------------------------
// /command — natural-language edit parsing (Gemini), never writes anything
// itself. Turns a typed instruction into the exact {jobNumber, col, value}
// shape the three save routes above already accept, so there is exactly
// one code path that ever stages a write — this route only ever proposes
// one for the frontend to show and confirm.
// ---------------------------------------------------------------------------

const COMMAND_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    ambiguous: { type: 'BOOLEAN' },
    reason: { type: 'STRING' },
    candidates: { type: 'ARRAY', items: { type: 'STRING' } },
    target: { type: 'STRING', enum: ['main-sheet', 'claim-calculator', 'upcoming-work'] },
    jobNumber: { type: 'STRING' },
    col: { type: 'INTEGER' },
    value: { type: 'STRING' },
    fieldLabel: { type: 'STRING' },
    humanSummary: { type: 'STRING' },
  },
  // Gemini's structured-output mode only enforces plain "required", no
  // conditional schema — so every field is required unconditionally, and
  // the prompt below tells the model to fill target/jobNumber/col/value
  // with harmless placeholders on the ambiguous path (server-side code
  // only ever reads them when ambiguous is false).
  required: ['ambiguous', 'target', 'jobNumber', 'col', 'value', 'humanSummary'],
}

function buildCommandPrompt({ text, jobs, mainSheetColumns, claimCalcFields, upcomingWorkFields }) {
  return `You turn one plain-English instruction into a single structured edit for a job-tracking spreadsheet. You never invent data — only match against the lists given below.

INSTRUCTION: "${text}"

JOBS (jobNumber, jobName):
${jobs.map((j) => `${j.jobNumber}: ${j.jobName}`).join('\n')}

MAIN SHEET CHECKLIST FIELDS (target "main-sheet", col, label — values are ONLY 'Yes', 'N/A', or '' — there is no 'No'):
${mainSheetColumns.map((c) => `${c.col}: ${c.label}`).join('\n')}

CLAIM CALCULATOR FIELDS (target "claim-calculator", col, label — numeric or free-text per label):
${claimCalcFields.map((f) => `${f.col}: ${f.label}`).join('\n')}

UPCOMING WORK FIELDS (target "upcoming-work", col, label — numeric hours or free-text notes):
${upcomingWorkFields.map((f) => `${f.col}: ${f.label}`).join('\n')}

Rules:
1. Resolve the job by number or name (allow minor typos) against the JOBS list only. If more than one job could plausibly match, or none do, return ambiguous.
2. Resolve the field against whichever field list matches the instruction's intent, using the exact "col" number listed. Never fabricate a jobNumber or col not present in the lists above.
3. For a main-sheet field, normalize the value to exactly 'Yes' (done/complete/tick it/mark it), 'N/A' (not applicable/doesn't apply), or '' (undo/unset/not done/clear it). Anything else for a main-sheet field (e.g. "no") is ambiguous — that value doesn't exist here.
4. For a claim-calculator or upcoming-work field, "value" must be ONLY the bare number as a string — digits, and at most one leading "-" and one ".", nothing else. Never include "%", "$", units, words, or any other character. "5% retention" -> "5". "40 hours" -> "40". The one exception is a field literally called "Notes", which is free text.
5. If the instruction implies more than one job or more than one field at once (e.g. "for all jobs", "every job", "both X and Y"), return ambiguous — never pick just one target for a bulk instruction.
6. If genuinely unclear, set "ambiguous" to true, fill "reason" and "candidates" (short human-readable descriptions, not job numbers), and set target/jobNumber/col/value/humanSummary to "" (or col to 0) as placeholders — every field below is required by the schema even on this path, but those placeholders are ignored whenever ambiguous is true.
7. Otherwise set "ambiguous" to false and fill: target (one of "main-sheet"/"claim-calculator"/"upcoming-work"), jobNumber (string), col (the exact integer from the matching list above), value (per rules 3/4 above), fieldLabel (the field's label from the list), and humanSummary (a short plain-English summary, e.g. "Job 8142 Fisher Developments — Retention %: 5"). Return ONLY the JSON object — no commentary, no markdown, no explanation before or after it.`
}

async function handleCommand(request, env) {
  const body = await request.json().catch(() => null)
  if (!body) {
    return json({ ok: false, error: 'bad_request', message: 'Invalid request body.' }, 400)
  }

  const { text, jobs, mainSheetColumns, claimCalcFields, upcomingWorkFields } = body
  const trimmed = String(text ?? '').trim()
  if (!trimmed) {
    return json({ ok: false, error: 'empty', message: 'Type an instruction first.' }, 400)
  }
  if (trimmed.length > 300) {
    return json({ ok: false, error: 'too_long', message: 'Keep it under 300 characters.' }, 400)
  }
  if (!Array.isArray(jobs) || jobs.length === 0) {
    return json({ ok: false, error: 'no_jobs', message: 'No jobs loaded to match against.' }, 400)
  }
  if (!env.GEMINI_API_KEY) {
    return json({ ok: false, error: 'not_configured', message: 'The AI command box is not configured yet.' }, 503)
  }

  const prompt = buildCommandPrompt({
    text: trimmed,
    jobs,
    mainSheetColumns: Array.isArray(mainSheetColumns) ? mainSheetColumns : [],
    claimCalcFields: Array.isArray(claimCalcFields) ? claimCalcFields : [],
    upcomingWorkFields: Array.isArray(upcomingWorkFields) ? upcomingWorkFields : [],
  })

  const geminiBody = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: COMMAND_RESPONSE_SCHEMA,
      thinkingConfig: { thinkingLevel: 'low' },
    },
  })
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${env.GEMINI_API_KEY}`

  let geminiRes
  // gemini-flash-latest returns a transient 503 ("high demand") often
  // enough in practice to be worth one retry before surfacing an error —
  // this is Google's model queue, not anything wrong with the request.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: geminiBody,
      })
    } catch (err) {
      if (attempt === 1) {
        return json({ ok: false, error: 'gemini_unreachable', message: `Could not reach the AI service: ${String(err.message ?? err)}` }, 502)
      }
      continue
    }
    if (geminiRes.ok || geminiRes.status !== 503 || attempt === 1) break
  }

  if (!geminiRes.ok) {
    const errText = await geminiRes.text().catch(() => '')
    return json({ ok: false, error: 'gemini_error', message: `AI service error (${geminiRes.status}). ${errText.slice(0, 200)}` }, 502)
  }

  const geminiPayload = await geminiRes.json().catch(() => null)
  const rawText = geminiPayload?.candidates?.[0]?.content?.parts?.[0]?.text
  let parsed
  try {
    parsed = JSON.parse(rawText)
  } catch {
    return json({ ok: false, error: 'gemini_bad_response', message: "Couldn't understand that — try rephrasing." }, 502)
  }

  if (parsed.ambiguous) {
    return json({ ok: true, ambiguous: true, reason: parsed.reason ?? 'Not sure what you meant.', candidates: parsed.candidates ?? [] })
  }

  // Never trust the model's own claim of validity — cross-check its
  // answer against the exact lists it was given, regardless of what it says.
  const { target, jobNumber, col, value, fieldLabel, humanSummary } = parsed
  const fieldList =
    target === 'main-sheet' ? mainSheetColumns
    : target === 'claim-calculator' ? claimCalcFields
    : target === 'upcoming-work' ? upcomingWorkFields
    : null
  const jobValid = jobs.some((j) => String(j.jobNumber) === String(jobNumber))
  const matchedField = Array.isArray(fieldList) ? fieldList.find((f) => Number(f.col) === Number(col)) : null
  if (!jobValid || !matchedField) {
    return json({ ok: true, ambiguous: true, reason: "Couldn't confidently match that to a real job and field.", candidates: [] })
  }

  // Belt-and-braces beyond the prompt's own instructions: a numeric field
  // (anything but main-sheet, and not literally labelled "notes") gets its
  // value stripped down to digits/./- , in case the model added a stray
  // "%", "$", or explanatory text around the number.
  const isNumericField = target !== 'main-sheet' && !/notes/i.test(matchedField.label ?? '')
  const cleanValue = isNumericField
    ? String(value ?? '').replace(/[^0-9.-]/g, '')
    : String(value ?? '')

  return json({
    ok: true,
    ambiguous: false,
    action: {
      target,
      jobNumber: String(jobNumber),
      col: Number(col),
      value: cleanValue,
      fieldLabel: fieldLabel ?? matchedField.label ?? '',
      humanSummary: humanSummary ?? '',
    },
  })
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    if (request.method === 'GET' && url.pathname === '/') {
      return html(renderForm())
    }

    if (request.method === 'POST' && url.pathname === '/upload') {
      try {
        return await handleUpload(request, env)
      } catch (err) {
        const msg = `Unexpected error: ${String(err.message ?? err)}`
        return respond(request, 500, { htmlMessage: `<div class="result err">${escapeHtml(msg)}</div>`, data: { error: 'unexpected', message: msg } })
      }
    }

    if (request.method === 'POST' && url.pathname === '/upload-from-url') {
      try {
        return await handleUploadFromUrl(request, env)
      } catch (err) {
        return json({ error: 'unexpected', message: `Unexpected error: ${String(err.message ?? err)}` }, 500)
      }
    }

    if (request.method === 'POST' && url.pathname === '/replace') {
      try {
        return await handleReplace(request, env)
      } catch (err) {
        const msg = `Unexpected error: ${String(err.message ?? err)}`
        return respond(request, 500, { htmlMessage: `<div class="result err">${escapeHtml(msg)}</div>`, data: { error: 'unexpected', message: msg } })
      }
    }

    if (request.method === 'POST' && url.pathname === '/main-sheet') {
      try {
        return await handleMainSheetUpdate(request, env)
      } catch (err) {
        const msg = `Unexpected error: ${String(err.message ?? err)}`
        return respond(request, 500, { htmlMessage: `<div class="result err">${escapeHtml(msg)}</div>`, data: { error: 'unexpected', message: msg } })
      }
    }

    if (request.method === 'POST' && url.pathname === '/archive-job') {
      try {
        return await handleArchiveJob(request, env)
      } catch (err) {
        const msg = `Unexpected error: ${String(err.message ?? err)}`
        return respond(request, 500, { htmlMessage: `<div class="result err">${escapeHtml(msg)}</div>`, data: { error: 'unexpected', message: msg } })
      }
    }

    if (request.method === 'POST' && url.pathname === '/new-job') {
      try {
        return await handleNewJob(request, env)
      } catch (err) {
        const msg = `Unexpected error: ${String(err.message ?? err)}`
        return respond(request, 500, { htmlMessage: `<div class="result err">${escapeHtml(msg)}</div>`, data: { error: 'unexpected', message: msg } })
      }
    }

    if (request.method === 'POST' && url.pathname === '/claim-calculator') {
      try {
        return await handleClaimCalculatorUpdate(request, env)
      } catch (err) {
        const msg = `Unexpected error: ${String(err.message ?? err)}`
        return respond(request, 500, { htmlMessage: `<div class="result err">${escapeHtml(msg)}</div>`, data: { error: 'unexpected', message: msg } })
      }
    }

    if (request.method === 'POST' && url.pathname === '/upcoming-work') {
      try {
        return await handleUpcomingWorkUpdate(request, env)
      } catch (err) {
        const msg = `Unexpected error: ${String(err.message ?? err)}`
        return respond(request, 500, { htmlMessage: `<div class="result err">${escapeHtml(msg)}</div>`, data: { error: 'unexpected', message: msg } })
      }
    }

    if (request.method === 'POST' && url.pathname === '/command') {
      try {
        return await handleCommand(request, env)
      } catch (err) {
        return json({ ok: false, error: 'unexpected', message: `Unexpected error: ${String(err.message ?? err)}` }, 500)
      }
    }

    if (request.method === 'GET' && url.pathname === '/status') {
      try {
        return await handleStatus(request, env)
      } catch (err) {
        return json({ status: 'error', message: `Unexpected error: ${String(err.message ?? err)}` }, 500)
      }
    }

    if (request.method === 'GET' && url.pathname === '/download') {
      try {
        const buffer = await getFileBuffer(FILE_PATH, env)
        return new Response(buffer, {
          status: 200,
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="${FILE_NAME}"`,
            ...CORS_HEADERS,
          },
        })
      } catch (err) {
        return html(renderForm(`<div class="result err">Could not download the current workbook: ${escapeHtml(String(err.message ?? err))}</div>`), 502)
      }
    }

    return new Response('Not found', { status: 404 })
  },
}
