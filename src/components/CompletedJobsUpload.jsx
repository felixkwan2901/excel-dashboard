import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { pollStagedStatus } from '../lib/pollStagedStatus'
import { workerFetch } from '@/lib/workerClient'
import { cents } from '../lib/format'
import { projectGpPerHour } from '../lib/completedJobPeople'
import { checklist, previewCompletedJobs } from '../lib/completedJobsPreview'
import { explainFailure, explainSkip } from '../lib/uploadWords'

// A month of completed-job exports from Katipolt, uploaded as one bundle. The
// files are checked HERE first — the same loader the workflow runs — so the
// page can say what will load, what needs a look and what's missing before
// anything is sent. scripts/apply-completed-jobs-uploads.mjs does the real load.

function bytesToBase64(bytes) {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

// The month these jobs were completed in, "YYYY-MM" — it decides which month's
// column they land in on Completed insights. Defaults to this month (NZ time).
function nzMonth(offset = 0) {
  const [y, m] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit' })
    .format(new Date()).split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 - offset, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
const MONTHS = Array.from({ length: 24 }, (_, i) => nzMonth(i))
// Completed jobs are exported on the last day of the month or in the first days
// after it, so during the first week of a month the default is the month that
// just ended (an upload on 1 Oct is September's jobs).
const nzDay = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland', day: 'numeric' }).format(new Date()))
const DEFAULT_MONTH = nzDay <= 7 ? MONTHS[1] : MONTHS[0]
const monthLabel = (ym) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-NZ', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const TYPE_LABEL = { quoted: 'Quoted', chargeup: 'Charge-up' }
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// Jobs already on the site, so the preview can say which ones this upload replaces.
async function knownJobs() {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}completed-jobs.json`, { cache: 'no-store' })
    return new Set((await res.json()).map((j) => String(j.jobNumber)))
  } catch { return new Set() }
}

function Tick({ ok, need }) {
  const tone = ok ? 'text-brand-green' : need ? 'text-red-400' : 'text-neutral-500'
  return <span className={`w-4 shrink-0 text-center font-bold ${tone}`} aria-hidden="true">{ok ? '✓' : need ? '✗' : '–'}</span>
}

// A list of things to look at, each with what to do — the fix shown once per
// distinct fix rather than under every line.
function Advice({ items, tone }) {
  const fixes = [...new Set(items.map((i) => i.fix).filter(Boolean))]
  return (
    <div className="flex flex-col gap-1.5">
      <ul className={`flex flex-col gap-1 text-[12.5px] ${tone}`}>
        {items.map((i, k) => <li key={k} className="flex gap-2"><span aria-hidden="true">•</span><span>{i.what}</span></li>)}
      </ul>
      {fixes.map((f) => <p key={f} className="text-[12.5px] text-neutral-300"><span className="font-medium text-white">What to do: </span>{f}</p>)}
    </div>
  )
}

export default function CompletedJobsUpload() {
  const [files, setFiles] = useState([])        // [{ name, bytes }]
  const [month, setMonth] = useState(DEFAULT_MONTH)
  const [preview, setPreview] = useState(null)   // { records, problems, needsLook, info, notes, noHours, replacing } | { error }
  const [checking, setChecking] = useState(false)
  const [status, setStatus] = useState('idle')   // idle | staging | processing | done | error
  const [outcome, setOutcome] = useState(null)   // done: result; error: explainFailure(...)
  const list = files.length ? checklist(files.map((f) => f.name)) : null
  const busy = status === 'staging' || status === 'processing'

  // Check the files as soon as they're chosen (the slow part is reading 40 workbooks).
  async function choose(fileList) {
    setStatus('idle'); setOutcome(null); setPreview(null)
    const picked = await Promise.all([...fileList].map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })))
    setFiles(picked)
    if (!picked.length) return
    setChecking(true)
    try {
      setPreview(await previewCompletedJobs(picked, await knownJobs()))
    } catch (err) {
      setPreview({ error: `The files couldn't be checked here: ${String(err.message ?? err)}` })
    } finally { setChecking(false) }
  }

  const canLoad = preview && !preview.error && preview.records.length > 0 && preview.problems.length === 0 && !(list?.other.length)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canLoad || busy) return
    setStatus('staging'); setOutcome(null)
    try {
      const packed = files.map((f) => ({ name: f.name, base64: bytesToBase64(f.bytes) }))
      const bundleBase64 = bytesToBase64(new TextEncoder().encode(JSON.stringify({ uploadedAt: new Date().toISOString(), month, files: packed })))
      const res = await workerFetch('/completed-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ names: packed.map((f) => f.name), bundleBase64 }),
      })
      const payload = await res.json()
      if (!res.ok) { setOutcome({ headline: payload.message ?? `The upload was refused (${res.status}).`, items: [] }); setStatus('error'); return }
      setStatus('processing')
      const r = await pollStagedStatus(payload.staged[0], { timeoutMs: 300000 })
      if (r.status === 'failed') { setOutcome(explainFailure(r.message)); setStatus('error'); return }
      if (r.status === 'timeout') { setOutcome({ slow: true }); setStatus('done'); return }
      setOutcome(r.result ?? {})
      setStatus('done')
    } catch (err) {
      setOutcome({ headline: `Could not reach the upload service: ${String(err.message ?? err)}`, items: [] })
      setStatus('error')
    }
  }

  const records = preview?.records ?? []
  const sorted = [...records].sort((a, b) => (projectGpPerHour(b) ?? -Infinity) - (projectGpPerHour(a) ?? -Infinity))

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-sm">Completed jobs</CardTitle>
        <p className="text-xs text-text-muted">
          A month of completed-job downloads from Katipolt, selected together. The files are checked here
          first, so you see what will load before anything is sent.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* 1 — month */}
          <div>
            <label htmlFor="completed-month" className="mb-1.5 block text-xs text-text-muted">
              <span className="mr-1.5 font-semibold text-white">1.</span> Month these jobs were completed in
            </label>
            <select id="completed-month" value={month} onChange={(e) => setMonth(e.target.value)} disabled={busy}
              className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white">
              {MONTHS.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          </div>

          {/* 2 — files + what's expected */}
          <div>
            <label htmlFor="completed-files" className="mb-1.5 block text-xs text-text-muted">
              <span className="mr-1.5 font-semibold text-white">2.</span> Choose the files (select them all at once)
            </label>
            <input id="completed-files" type="file" accept=".xlsx,.csv" multiple required disabled={busy}
              onChange={(e) => choose(e.target.files)}
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white file:mr-3 file:rounded-md file:border-0 file:bg-white/[0.08] file:px-2.5 file:py-1 file:text-xs file:text-white" />
            <ul className="mt-2 flex flex-col gap-1 text-[12.5px]">
              {(list ?? checklist([])).items.map((i) => (
                <li key={i.key} className="flex items-start gap-2">
                  <Tick ok={list ? i.ok : false} need={list ? i.need : false} />
                  <span className={list && !i.ok && i.need ? 'text-red-300' : 'text-neutral-200'}>
                    {i.label}
                    <span className="ml-1.5 text-neutral-500">{i.note}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* 3 — what will load */}
          {files.length > 0 && (
            <div className="rounded-[14px] border border-white/[0.08] bg-white/[0.02] p-4">
              <p className="mb-2 text-xs text-text-muted"><span className="mr-1.5 font-semibold text-white">3.</span> Check</p>
              {checking && <p className="text-[13px] text-neutral-300">Checking {plural(files.length, 'file')}…</p>}
              {!checking && preview?.error && <p className="text-[13px] text-red-400">{preview.error}</p>}
              {!checking && preview && !preview.error && (
                <div className="flex flex-col gap-3">
                  <p className="text-[14px] font-medium text-white">
                    {plural(records.length, 'job')} matched
                    {preview.needsLook.length > 0 && <> · <span className="text-amber-300">{preview.needsLook.length} need{preview.needsLook.length === 1 ? 's' : ''} a look</span></>}
                    {preview.noHours > 0 && <> · <span className="text-neutral-400">{preview.noHours} {preview.noHours === 1 ? 'has' : 'have'} no hours (no GP/hr)</span></>}
                    {preview.replacing > 0 && <> · <span className="text-neutral-400">{preview.replacing} already loaded, will be replaced</span></>}
                  </p>
                  {preview.problems.length > 0 && (
                    <div className="rounded-[10px] border border-red-500/30 bg-red-500/[0.06] p-3">
                      <p className="mb-1.5 text-[13px] font-medium text-red-300">Nothing can load yet — manifest.csv doesn&apos;t match the files.</p>
                      <Advice items={preview.problems} tone="text-red-200" />
                    </div>
                  )}
                  {preview.needsLook.length > 0 && (
                    <div className="rounded-[10px] border border-amber-400/30 bg-amber-400/[0.06] p-3">
                      <p className="mb-1.5 text-[13px] font-medium text-amber-300">Needs a look {preview.problems.length ? '' : '— these load anyway, or fix them first'}</p>
                      <Advice items={preview.needsLook} tone="text-amber-100" />
                    </div>
                  )}
                  {preview.info.length > 0 && <Advice items={preview.info} tone="text-neutral-400" />}
                  {records.length > 0 && (
                    <details>
                      <summary className="cursor-pointer text-[12.5px] text-neutral-300">The {plural(records.length, 'job')}</summary>
                      <div className="table-scroll mt-2 max-h-[40vh]">
                        <table className="data-table data-table--compact">
                          <thead><tr><th>Job #</th><th>Job name</th><th>Type</th><th className="num">Actual h</th><th className="num">GP/hr</th><th>File</th></tr></thead>
                          <tbody>
                            {sorted.map((r) => (
                              <tr key={r.jobNumber}>
                                <td>{r.jobNumber}</td>
                                <td>{r.jobName}{(r.flags ?? []).includes('no-name') && <span className="ml-1.5 text-[11px] text-neutral-500">no name in Katipolt</span>}</td>
                                <td>{TYPE_LABEL[r.type]}</td>
                                <td className="num">{r.hours}</td>
                                <td className="num">{projectGpPerHour(r) == null ? '—' : cents(projectGpPerHour(r))}</td>
                                <td className="text-neutral-500">{r.sourceFile}{r.timesheetFile ? ` + ${r.timesheetFile}` : ''}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  )}
                  {preview.notes.length > 0 && (
                    <details><summary className="cursor-pointer text-[12px] text-neutral-500">How the files were matched</summary>
                      <ul className="mt-1 flex flex-col gap-0.5 text-[12px] text-neutral-500">{preview.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
                    </details>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 4 — load */}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={!canLoad || busy || checking}>
              {status === 'staging' ? 'Uploading…' : status === 'processing' ? 'Loading on the site (about a minute)…'
                : canLoad ? `Load ${plural(records.length, 'job')} into ${monthLabel(month)}` : 'Load completed jobs'}
            </Button>
            {!canLoad && !checking && files.length > 0 && preview && !preview.error && preview.problems.length === 0 && records.length === 0 && (
              <span className="text-[12.5px] text-neutral-400">No job could be read from these files — check the list above.</span>
            )}
          </div>

          {status === 'done' && outcome && (
            <div className="rounded-[14px] border border-brand-green/40 bg-brand-green/[0.08] p-4">
              {outcome.slow ? (
                <p className="text-[14px] font-medium text-brand-green">Still loading after 5 minutes — check Completed jobs shortly.</p>
              ) : (
                <>
                  <p className="text-[16px] font-semibold text-brand-green">
                    Done — {plural(outcome.loaded ?? records.length, 'job')} loaded for {monthLabel(outcome.month ?? month)}.
                  </p>
                  <p className="mt-1 text-[12.5px] text-neutral-300">The site updates in about a minute, then they&apos;re on the Completed jobs tab.</p>
                  {outcome.needsLook?.length > 0 && (
                    <div className="mt-3"><p className="mb-1 text-[13px] font-medium text-amber-300">Needs a look</p><Advice items={outcome.needsLook.map(explainSkip)} tone="text-amber-100" /></div>
                  )}
                </>
              )}
            </div>
          )}
          {status === 'error' && outcome && (
            <div className="rounded-[14px] border border-red-500/40 bg-red-500/[0.08] p-4">
              <p className="text-[14px] font-medium text-red-300">{outcome.headline}</p>
              {outcome.items?.length > 0 && <div className="mt-2"><Advice items={outcome.items} tone="text-red-200" /></div>}
              {outcome.fix && <p className="mt-2 text-[12.5px] text-neutral-300">{outcome.fix}</p>}
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
