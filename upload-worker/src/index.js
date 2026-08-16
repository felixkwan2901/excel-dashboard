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
const FILE_PATH = 'Cassidy_Davies_Electrical_BPMN_Data.xlsx'
const SYNC_META_PATH = 'sync-meta.json'
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
  input[type="file"], input[type="password"] {
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
        <label for="replace-password">Upload password</label>
        <input type="password" id="replace-password" name="password" required />

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
        <label for="password">Upload password</label>
        <input type="password" id="password" name="password" required />

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
  const password = form.get('password')

  if (!env.UPLOAD_PASSWORD || password !== env.UPLOAD_PASSWORD) {
    return respond(request, 401, { htmlMessage: `<div class="result err">Wrong password. Please try again.</div>`, data: { error: 'wrong_password', message: 'Wrong password.' } })
  }

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
// /replace — stage the uploaded workbook under pending-updates/replace/
// ---------------------------------------------------------------------------

async function handleReplace(request, env) {
  const form = await request.formData()
  const password = form.get('password')

  if (!env.UPLOAD_PASSWORD || password !== env.UPLOAD_PASSWORD) {
    return respond(request, 401, { htmlMessage: `<div class="result err">Wrong password. Please try again.</div>`, data: { error: 'wrong_password', message: 'Wrong password.' } })
  }

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
  const { password, edits } = body

  if (!env.UPLOAD_PASSWORD || password !== env.UPLOAD_PASSWORD) {
    return respond(request, 401, { htmlMessage: `<div class="result err">Wrong password. Please try again.</div>`, data: { error: 'wrong_password', message: 'Wrong password.' } })
  }
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

  return json({ status: 'done' })
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
            'Content-Disposition': `attachment; filename="${FILE_PATH}"`,
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
