import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { pollStagedStatus } from '../lib/pollStagedStatus'
import { workerFetch } from '@/lib/workerClient'

// A month of completed-job exports from Katipolt (the katipolt-completed-export
// prompt's downloads plus its manifest.csv), uploaded as one bundle so the
// workflow always sees the whole batch. scripts/apply-completed-jobs-uploads.mjs
// matches each file to its job and refuses the lot if they don't line up.

function bytesToBase64(bytes) {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

// The month these jobs were completed in, "YYYY-MM" — it decides which month's
// column they land in on Completed insights. Defaults to this month (NZ time);
// pick an earlier one when loading older months.
function nzMonth(offset = 0) {
  const [y, m] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit' })
    .format(new Date()).split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 - offset, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
const MONTHS = Array.from({ length: 24 }, (_, i) => nzMonth(i))
const monthLabel = (ym) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-NZ', { month: 'long', year: 'numeric', timeZone: 'UTC' })

function summarise(files) {
  const names = [...files].map((f) => f.name)
  return {
    pl: names.filter((n) => /^ProfitAndLoss/i.test(n) || /^CU-\d+\.xlsx$/i.test(n) || /^Q-\d+-pl\.xlsx$/i.test(n)).length,
    ts: names.filter((n) => /^Timesheets/i.test(n) || /^Q-\d+-ts\.xlsx$/i.test(n)).length,
    lists: names.filter((n) => /^Jobs/i.test(n)).length,
    summary: names.filter((n) => /^Profit\s*&\s*Loss Summary/i.test(n)).length,
    manifest: names.some((n) => n.toLowerCase() === 'manifest.csv'),
    renamed: names.some((n) => /^(CU|Q)-\d+/i.test(n)),
    other: names.filter((n) => !/\.xlsx$/i.test(n) && n.toLowerCase() !== 'manifest.csv'),
  }
}

export default function CompletedJobsUpload() {
  const [files, setFiles] = useState(null)
  const [month, setMonth] = useState(MONTHS[0])
  const [status, setStatus] = useState('idle') // idle | staging | processing | done | error
  const [message, setMessage] = useState('')
  const [result, setResult] = useState(null)
  const sum = files ? summarise(files) : null
  const busy = status === 'staging' || status === 'processing'

  async function handleSubmit(e) {
    e.preventDefault()
    if (!files?.length) return
    setStatus('staging'); setMessage(''); setResult(null)
    try {
      const packed = await Promise.all([...files].map(async (f) => ({ name: f.name, base64: bytesToBase64(new Uint8Array(await f.arrayBuffer())) })))
      const bundleBase64 = bytesToBase64(new TextEncoder().encode(JSON.stringify({ uploadedAt: new Date().toISOString(), month, files: packed })))
      const res = await workerFetch('/completed-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ names: packed.map((f) => f.name), bundleBase64 }),
      })
      const payload = await res.json()
      if (!res.ok) { setMessage(payload.message ?? `Request failed (${res.status}).`); setStatus('error'); return }
      setStatus('processing'); setMessage(payload.message)
      const r = await pollStagedStatus(payload.staged[0], { timeoutMs: 300000 })
      if (r.status === 'failed') { setMessage(r.message); setStatus('error'); return }
      if (r.status === 'timeout') { setMessage('Still processing after 5 minutes — check the Completed jobs tab shortly.'); setStatus('done'); return }
      setResult(r.result ?? null)
      setMessage(r.result
        ? `Loaded ${r.result.loaded} completed job(s) for ${monthLabel(r.result.month ?? month)}. The site updates in about a minute — then refresh to see them in Completed jobs.`
        : 'Processed. The site updates in about a minute — then refresh to see them in Completed jobs.')
      setStatus('done')
    } catch (err) {
      setMessage(`Could not reach the upload service: ${String(err.message ?? err)}`)
      setStatus('error')
    }
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-sm">Completed jobs</CardTitle>
        <p className="text-xs text-text-muted">
          This month&apos;s completed-job downloads from Katipolt, selected together: every ProfitAndLoss and
          Timesheets file, the Jobs list, and the <b>Profit &amp; Loss Summary</b> report. The report gives every job&apos;s
          figures and lets each charge-up file find its own job number (by its sell and hours), so manifest.csv is
          optional. If a manifest is included it&apos;s checked against the files; a job that can&apos;t be placed is
          listed below instead of being guessed.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="completed-month" className="mb-1.5 block text-xs text-text-muted">
              Month these jobs were completed in
            </label>
            <select
              id="completed-month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white"
            >
              {MONTHS.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
            <p className="mt-1 text-[11px] text-text-muted">
              Katipolt&apos;s &ldquo;Completed: This Month&rdquo; list is this month. Loading an older month? Pick it here.
            </p>
          </div>

          <div>
            <label htmlFor="completed-files" className="mb-1.5 block text-xs text-text-muted">
              Completed-job exports + Profit & Loss Summary (select all)
            </label>
            <input
              id="completed-files"
              type="file"
              accept=".xlsx,.csv"
              multiple
              required
              onChange={(e) => { setFiles(e.target.files); setStatus('idle'); setMessage(''); setResult(null) }}
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white file:mr-3 file:rounded-md file:border-0 file:bg-white/[0.08] file:px-2.5 file:py-1 file:text-xs file:text-white"
            />
          </div>

          {sum && (
            <p className="text-xs text-text-muted">
              {sum.pl} Profit &amp; Loss · {sum.ts} Timesheets · {sum.lists} Jobs list{sum.lists === 1 ? '' : 's'} ·{' '}
              {sum.summary ? 'Profit & Loss Summary ✓' : <span className="text-status-warning">no Profit &amp; Loss Summary</span>} ·{' '}
              {sum.manifest ? 'manifest.csv ✓' : 'no manifest.csv'}
              {!sum.manifest && !sum.renamed && !sum.summary && <span className="text-status-warning"> — without either, the files can’t be matched to jobs</span>}
              {sum.other.length > 0 && <span className="text-status-warning"> · not accepted: {sum.other.join(', ')}</span>}
            </p>
          )}

          <Button type="submit" disabled={busy || (sum && !sum.manifest && !sum.renamed && !sum.summary)} className="mt-1">
            {status === 'staging' ? 'Uploading…' : status === 'processing' ? 'Processing…' : 'Upload completed jobs'}
          </Button>

          {message && (
            <p className={`text-sm ${status === 'error' ? 'text-red-400' : 'text-brand-green'}`}>{message}</p>
          )}
          {result?.needsLook?.length > 0 && (
            <div className="text-xs text-text-muted">
              <p className="mb-1 font-medium text-status-warning">Needs a look ({result.needsLook.length}):</p>
              <ul className="flex flex-col gap-0.5">
                {result.needsLook.map((s, i) => <li key={i}>{s.job} — {s.reason}</li>)}
              </ul>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
