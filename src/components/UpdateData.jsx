import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'

const UPLOAD_WORKER_URL = 'https://cde-data-upload.fkw24.workers.dev'

function formatPct(n) {
  return typeof n === 'number' ? `${(n * 100).toFixed(1)}%` : '—'
}

function marginBadge(margin) {
  if (typeof margin !== 'number') return null
  if (margin < 0) return <Badge variant="destructive">negative margin</Badge>
  if (margin < 0.1) return <Badge variant="secondary">thin margin</Badge>
  return null
}

export default function UpdateData({ onBack }) {
  const [password, setPassword] = useState('')
  const [files, setFiles] = useState(null)
  const [status, setStatus] = useState('idle') // idle | submitting | done | error
  const [result, setResult] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')

  const [replacePassword, setReplacePassword] = useState('')
  const [replaceFile, setReplaceFile] = useState(null)
  const [replaceConfirmed, setReplaceConfirmed] = useState(false)
  const [replaceStatus, setReplaceStatus] = useState('idle') // idle | submitting | done | error
  const [replaceMessage, setReplaceMessage] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!files || files.length === 0) return

    setStatus('submitting')
    setErrorMessage('')
    setResult(null)

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
      if (!res.ok && !payload.updated) {
        setErrorMessage(payload.message ?? `Request failed (${res.status}).`)
        setResult(payload)
        setStatus('error')
        return
      }
      setResult(payload)
      setStatus('done')
    } catch (err) {
      setErrorMessage(`Could not reach the upload service: ${String(err.message ?? err)}`)
      setStatus('error')
    }
  }

  async function handleReplaceSubmit(e) {
    e.preventDefault()
    if (!replaceFile || !replaceConfirmed) return

    setReplaceStatus('submitting')
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
      setReplaceMessage(payload.message ?? `Request failed (${res.status}).`)
      setReplaceStatus(res.ok ? 'done' : 'error')
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
          <CardTitle className="text-sm">Check the current workbook first</CardTitle>
          <p className="mt-1 text-sm text-text-muted">
            You never need to find or upload the master file yourself — every upload below
            automatically reads the live workbook and fills in each job&apos;s next empty week. If
            you just want to see what&apos;s currently recorded before uploading, download it here.
          </p>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="w-full">
            <a href={`${UPLOAD_WORKER_URL}/download`}>Download the current workbook</a>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Update job data</CardTitle>
          <p className="mt-1 text-sm text-text-muted">
            Select this week&apos;s downloaded job P&amp;L exports (as many as you like). Each
            job&apos;s figures are merged into the workbook and the dashboard updates within a
            couple of minutes.
          </p>
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

            <Button type="submit" disabled={status === 'submitting'} className="mt-1">
              {status === 'submitting' ? 'Uploading & merging…' : 'Upload & merge'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {status === 'error' && !result && (
        <Card className="mt-4">
          <CardContent>
            <p className="text-sm text-status-critical">{errorMessage}</p>
          </CardContent>
        </Card>
      )}

      {result && (
        <div className="mt-4 flex flex-col gap-4">
          <Card>
            <CardContent>
              <p className="text-sm text-text-primary">
                {result.pushed
                  ? `Merged ${result.updated.length} job(s) into the workbook. The dashboard will rebuild and go live in a couple of minutes.`
                  : errorMessage || 'Nothing was merged — none of the uploaded file(s) matched a job that had room for a new update.'}
              </p>
            </CardContent>
          </Card>

          {result.updated?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Updated ({result.updated.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-2 text-sm">
                  {result.updated.map((u) => (
                    <li key={u.jobNumber} className="flex items-center justify-between gap-3">
                      <span className="text-text-secondary">
                        {u.jobNumber} {u.jobName} → {u.weekLabel}
                      </span>
                      <span className="flex items-center gap-2 whitespace-nowrap">
                        <span className="text-text-muted">
                          {formatPct(u.before.marginToDate)} → {formatPct(u.after.marginToDate)}
                        </span>
                        {marginBadge(u.after.marginToDate)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {result.noRoomLeft?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-status-critical">
                  No empty week slot left ({result.noRoomLeft.length})
                </CardTitle>
                <p className="text-xs text-text-muted">
                  Roll these over first: move Week 5 up into &quot;Start of month&quot;, clear
                  Weeks 1-5, then re-upload.
                </p>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-1 text-sm text-text-secondary">
                  {result.noRoomLeft.map((r) => (
                    <li key={r.jobNumber}>
                      {r.jobNumber} {r.jobName}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {result.possibleDuplicates?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-status-critical">
                  Skipped as likely duplicate uploads ({result.possibleDuplicates.length})
                </CardTitle>
                <p className="text-xs text-text-muted">
                  These exactly match figures already recorded — probably the same file uploaded
                  twice. Nothing was written for these jobs. If a job genuinely had zero change
                  this week, that&apos;s fine to ignore.
                </p>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-1 text-sm text-text-secondary">
                  {result.possibleDuplicates.map((d) => (
                    <li key={d.jobNumber}>
                      {d.jobNumber} {d.jobName} (matches {d.matchesWeek})
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {result.unmatchedFiles?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-status-critical">
                  Job number not found in workbook ({result.unmatchedFiles.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-1 text-sm text-text-secondary">
                  {result.unmatchedFiles.map((u) => (
                    <li key={u.file}>
                      {u.jobNumber} {u.jobName} ({u.file})
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {result.failures?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-status-critical">
                  Could not read ({result.failures.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-1 text-sm text-text-secondary">
                  {result.failures.map((f) => (
                    <li key={f.file}>
                      {f.file}: {f.error}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {result.notUpdated?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-text-muted">
                  No new export this time ({result.notUpdated.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-wrap gap-1.5 text-sm">
                  {result.notUpdated.map((n) => (
                    <li key={n.jobNumber}>
                      <Badge variant="outline">
                        {n.jobNumber} {n.jobName}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {result.duplicateCount > 0 && (
            <p className="text-center text-xs text-text-muted">
              Skipped {result.duplicateCount} exact duplicate file(s).
            </p>
          )}
        </div>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-sm">Replace with an edited file</CardTitle>
          <p className="mt-1 text-sm text-text-muted">
            Already downloaded the workbook and fixed something directly in Excel? Upload that
            file here to replace the whole workbook as-is — no merging, this overwrites
            everything.
          </p>
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
              I understand this replaces the entire workbook
            </label>

            <Button type="submit" variant="outline" disabled={replaceStatus === 'submitting'}>
              {replaceStatus === 'submitting' ? 'Replacing…' : 'Replace workbook'}
            </Button>
          </form>

          {replaceMessage && (
            <p className={`mt-4 text-sm ${replaceStatus === 'error' ? 'text-status-critical' : 'text-text-primary'}`}>
              {replaceMessage}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
