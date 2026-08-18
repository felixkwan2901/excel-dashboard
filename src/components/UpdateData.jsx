import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { pollStagedStatus } from '../lib/pollStagedStatus'

const UPLOAD_WORKER_URL = 'https://cde-data-upload.fkw24.workers.dev'

// scripts/update-jobs.mjs writes a specific outcome per file once it's
// done — falls back to the coarser staged-status label for an older
// upload from before that existed, or one still mid-flight/timed out.
const OUTCOME_LABEL = {
  updated: 'Updated',
  duplicate: 'Skipped — duplicate',
  no_room: 'Malformed job block',
  unmatched: 'Job number not found',
  unreadable: 'Could not be read',
}
const OUTCOME_TONE = {
  updated: 'text-brand-green',
  duplicate: 'text-text-muted',
  no_room: 'text-status-critical',
  unmatched: 'text-status-critical',
  unreadable: 'text-status-critical',
}

function resultLabel(r) {
  if (r.result?.outcome) return OUTCOME_LABEL[r.result.outcome] ?? r.result.outcome
  if (r.status === 'done') return 'Processed'
  if (r.status === 'failed') return r.message || 'Failed'
  if (r.status === 'timeout') return 'Still processing — check back shortly'
  return r.status
}

function resultTone(r) {
  if (r.result?.outcome) return OUTCOME_TONE[r.result.outcome] ?? 'text-text-secondary'
  return r.status === 'failed' ? 'text-status-critical' : 'text-brand-green'
}

export default function UpdateData({ onBack }) {
  const [password, setPassword] = useState('')
  const [files, setFiles] = useState(null)
  const [status, setStatus] = useState('idle') // idle | staging | processing | done | error
  const [message, setMessage] = useState('')
  const [fileResults, setFileResults] = useState(null) // [{ name, status, message }]

  const [replacePassword, setReplacePassword] = useState('')
  const [replaceFile, setReplaceFile] = useState(null)
  const [replaceConfirmed, setReplaceConfirmed] = useState(false)
  const [replaceStatus, setReplaceStatus] = useState('idle') // idle | staging | processing | done | error
  const [replaceMessage, setReplaceMessage] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!files || files.length === 0) return

    setStatus('staging')
    setMessage('')
    setFileResults(null)

    const form = new FormData()
    form.set('password', password)
    for (const file of files) form.append('files', file)

    try {
      const res = await fetch(`${UPLOAD_WORKER_URL}/upload`, {
        method: 'POST',
        body: form,
        headers: { Accept: 'application/json' },
      })
      const payload = await res.json()
      if (!res.ok) {
        setMessage(payload.message ?? `Request failed (${res.status}).`)
        setStatus('error')
        return
      }

      setStatus('processing')
      setMessage(payload.message)

      const staged = payload.staged ?? []
      const names = staged.map((p) => p.split('/').pop().replace(/^\d+-[a-z0-9]+-/, ''))
      const results = await Promise.all(staged.map((path) => pollStagedStatus(path)))
      setFileResults(results.map((r, i) => ({ name: names[i], ...r })))
      setStatus('done')
    } catch (err) {
      setMessage(`Could not reach the upload service: ${String(err.message ?? err)}`)
      setStatus('error')
    }
  }

  async function handleReplaceSubmit(e) {
    e.preventDefault()
    if (!replaceFile || !replaceConfirmed) return

    setReplaceStatus('staging')
    setReplaceMessage('')

    const form = new FormData()
    form.set('password', replacePassword)
    form.set('file', replaceFile)

    try {
      const res = await fetch(`${UPLOAD_WORKER_URL}/replace`, {
        method: 'POST',
        body: form,
        headers: { Accept: 'application/json' },
      })
      const payload = await res.json()
      if (!res.ok) {
        setReplaceMessage(payload.message ?? `Request failed (${res.status}).`)
        setReplaceStatus('error')
        return
      }

      setReplaceStatus('processing')
      setReplaceMessage(payload.message)
      const result = await pollStagedStatus(payload.staged)
      if (result.status === 'done') {
        setReplaceMessage('Replaced the workbook with your edited file — the site will redeploy in about a minute before it shows up here.')
        setReplaceStatus('done')
      } else if (result.status === 'failed') {
        setReplaceMessage(result.message)
        setReplaceStatus('error')
      } else {
        setReplaceMessage('Still processing after 3 minutes — check back shortly; it may still land.')
        setReplaceStatus('error')
      }
    } catch (err) {
      setReplaceMessage(`Could not reach the upload service: ${String(err.message ?? err)}`)
      setReplaceStatus('error')
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <nav className="mb-6 flex items-center gap-1.5 text-sm text-text-muted">
        <button className="transition-colors hover:text-text-primary" onClick={onBack}>
          Operations overview
        </button>
        <span aria-hidden="true">/</span>
        <span className="text-text-primary">Update data</span>
      </nav>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-sm">Replace with an edited file</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleReplaceSubmit} className="flex flex-col gap-4">
            <div>
              <label htmlFor="replace-password" className="mb-1.5 block text-xs text-text-muted">
                Upload password
              </label>
              <input
                id="replace-password"
                type="password"
                value={replacePassword}
                onChange={(e) => setReplacePassword(e.target.value)}
                required
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white focus:border-brand-green/50 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="replace-file" className="mb-1.5 block text-xs text-text-muted">
                Edited workbook (.xlsx)
              </label>
              <input
                id="replace-file"
                type="file"
                accept=".xlsx"
                required
                onChange={(e) => setReplaceFile(e.target.files?.[0] ?? null)}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white file:mr-3 file:rounded-md file:border-0 file:bg-white/[0.08] file:px-2.5 file:py-1 file:text-xs file:text-white"
              />
            </div>

            <label className="flex items-start gap-2 text-xs text-text-muted">
              <input
                type="checkbox"
                checked={replaceConfirmed}
                onChange={(e) => setReplaceConfirmed(e.target.checked)}
                required
                className="mt-0.5"
              />
              Replaces the entire workbook
            </label>

            <Button
              type="submit"
              variant="outline"
              disabled={replaceStatus === 'staging' || replaceStatus === 'processing'}
            >
              {replaceStatus === 'staging'
                ? 'Uploading…'
                : replaceStatus === 'processing'
                  ? 'Processing…'
                  : 'Replace workbook'}
            </Button>
          </form>

          {replaceMessage && (
            <p className={`mt-4 text-sm ${replaceStatus === 'error' ? 'text-status-critical' : 'text-text-primary'}`}>
              {replaceMessage}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Update job data</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label htmlFor="update-password" className="mb-1.5 block text-xs text-text-muted">
                Upload password
              </label>
              <input
                id="update-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white focus:border-brand-green/50 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="update-files" className="mb-1.5 block text-xs text-text-muted">
                Job exports (.xlsx, select multiple)
              </label>
              <input
                id="update-files"
                type="file"
                accept=".xlsx"
                multiple
                required
                onChange={(e) => setFiles(e.target.files)}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white file:mr-3 file:rounded-md file:border-0 file:bg-white/[0.08] file:px-2.5 file:py-1 file:text-xs file:text-white"
              />
            </div>

            <Button type="submit" disabled={status === 'staging' || status === 'processing'} className="mt-1">
              {status === 'staging' ? 'Uploading…' : status === 'processing' ? 'Processing…' : 'Upload & merge'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {message && (
        <Card className="mt-4">
          <CardContent>
            <p className={`text-sm ${status === 'error' ? 'text-status-critical' : 'text-text-primary'}`}>
              {message}
            </p>
          </CardContent>
        </Card>
      )}

      {fileResults && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-sm">Results</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3 text-sm">
              {fileResults.map((r) => (
                <li key={r.name} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-text-secondary">{r.name}</span>
                    <span className={resultTone(r)}>{resultLabel(r)}</span>
                  </div>
                  {r.result?.message && <p className="text-xs text-text-muted">{r.result.message}</p>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card className="mt-6">
        <CardContent>
          <Button asChild variant="outline" className="w-full">
            <a href={`${UPLOAD_WORKER_URL}/download`}>Download the current workbook</a>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
