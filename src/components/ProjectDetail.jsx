import { useState } from 'react'
import { ArrowLeft, AlertTriangle, Archive, SlidersHorizontal } from 'lucide-react'
import TrendBadge from './TrendBadge'
import { money, percent } from '../lib/format'
import { statusReasons } from '../lib/statusReasons'
import { pollStagedStatus } from '../lib/pollStagedStatus'

const UPLOAD_WORKER_URL = 'https://cde-data-upload.fkw24.workers.dev'

// Archiving hides a job everywhere on the dashboard without touching any
// of its data in the workbook — reversible from the Job Directory's
// "Archived jobs" panel. An explicit confirm step, since it's a real
// change even though it's a safe one.
function ArchiveJobControl({ job, onBack }) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState({ kind: 'idle', message: '' })
  const [busy, setBusy] = useState(false)

  async function handleArchive() {
    setBusy(true)
    setStatus({ kind: 'idle', message: '' })
    try {
      const res = await fetch(`${UPLOAD_WORKER_URL}/archive-job`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ jobNumber: job.jobNumber, action: 'archive' }),
      })
      const payload = await res.json()
      if (!res.ok) {
        setStatus({ kind: 'error', message: payload.message ?? `Request failed (${res.status}).` })
        setBusy(false)
        return
      }
      setStatus({ kind: 'idle', message: 'Archiving…' })
      const result = await pollStagedStatus(payload.staged)
      if (result.status === 'done') {
        setStatus({ kind: 'ok', message: 'Archived — taking you back to the job list.' })
        setTimeout(onBack, 1500)
      } else if (result.status === 'failed') {
        setStatus({ kind: 'error', message: result.message })
        setBusy(false)
      } else {
        setStatus({ kind: 'error', message: 'Still processing after 3 minutes — check back shortly.' })
        setBusy(false)
      }
    } catch (err) {
      setStatus({ kind: 'error', message: `Could not reach the upload service: ${String(err.message ?? err)}` })
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-fit items-center gap-1.5 rounded-full border border-white/10 px-3.5 py-1.5 text-sm text-neutral-400 transition-colors hover:border-red-400/40 hover:text-red-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
      >
        <Archive size={14} aria-hidden="true" />
        Archive job
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-[13px] text-neutral-300">
        Archive {job.jobNumber} {job.jobName}? It&apos;ll disappear from every page, but nothing
        in the workbook is touched — reversible from the Job Directory&apos;s Archived jobs panel.
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={handleArchive}
          disabled={busy}
          className="shrink-0 rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-1.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-400/20 disabled:opacity-50"
        >
          {busy ? 'Archiving…' : 'Confirm archive'}
        </button>
        <button
          onClick={() => setOpen(false)}
          disabled={busy}
          className="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-neutral-400 hover:text-white disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
      {status.message && (
        <p className={`text-[13px] ${status.kind === 'error' ? 'text-red-400' : 'text-brand-green'}`}>
          {status.message}
        </p>
      )}
    </div>
  )
}

function Field({ label, children, warn }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-neutral-500">{label}</span>
      <div className={`text-[15px] ${warn ? 'font-semibold text-amber-400' : 'text-neutral-100'}`}>
        {children}
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="mt-6 border-t border-white/10 pt-6">
      <h2 className="mb-4 text-[13px] font-semibold tracking-wide text-neutral-400 uppercase">
        {title}
      </h2>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
    </div>
  )
}

export default function ProjectDetail({ job, onBack }) {
  const reasons = statusReasons(job)
  const [showCalculated, setShowCalculated] = useState(false)

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="flex w-fit items-center gap-1.5 rounded-full border border-white/10 px-3.5 py-1.5 text-sm text-neutral-300 transition-colors hover:border-white/20 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          All jobs
        </button>

        <button
          onClick={() => setShowCalculated((v) => !v)}
          aria-pressed={showCalculated}
          className={`flex w-fit items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green ${
            showCalculated
              ? 'border-brand-green/50 bg-brand-green/10 text-brand-green'
              : 'border-white/10 text-neutral-400 hover:border-white/20 hover:text-white'
          }`}
        >
          <SlidersHorizontal size={14} aria-hidden="true" />
          {showCalculated ? 'Hide calculated figures' : 'Show calculated figures'}
        </button>
      </div>

      <div className="rounded-[18px] border border-white/[0.06] bg-[#11161c] p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-neutral-500 tabular-nums">Job {job.jobNumber}</p>
            <h1 className="mt-1 text-3xl font-bold text-white">{job.jobName}</h1>
            <div className="mt-2">
              <TrendBadge marginTrend={job.marginTrend} />
            </div>
          </div>
          <p className="text-3xl font-bold text-brand-green tabular-nums">
            {money(job.quotedPrice)}
          </p>
        </div>

        {job.flagged && reasons.length > 0 && (
          <div className="mt-5 flex items-start gap-3 rounded-xl border border-amber-400/30 bg-amber-400/[0.08] p-4">
            <AlertTriangle
              size={18}
              className="mt-0.5 shrink-0 text-amber-400"
              aria-hidden="true"
            />
            <div className="flex flex-col gap-1">
              <p className="text-[13px] font-semibold text-amber-400">Why this job is flagged</p>
              {reasons.map((reason) => (
                <p key={reason} className="text-[13px] text-neutral-200">
                  {reason}
                </p>
              ))}
            </div>
          </div>
        )}

        <Section title="Cost">
          {/* "Total quoted cost" (this section) is the quoted cost basis —
              materials + labour, before markup — and is intentionally a
              smaller figure than the "Quoted Price" shown above (the
              client-facing sale price); quotedMargin = (quotedPrice -
              totalQuotedCost) / quotedPrice. They're two distinct figures,
              not the same value shown twice, hence spelling out "cost"
              here rather than just "Total quoted". */}
          <Field label="Total quoted cost">{money(job.totalQuotedCost)}</Field>
          <Field label="Total actual cost" warn={job.overBudget}>
            {money(job.totalActualCost)}
          </Field>
          {job.projectedTotalCost !== null && (
            <Field label="Projected total cost (at current pace)" warn={job.overBudget}>
              {money(job.projectedTotalCost)}
            </Field>
          )}
          <Field label="Materials (quoted / actual)">
            {money(job.quotedMaterialCost)} / {money(job.actualMaterialCost)}
          </Field>
          <Field label="Labour (quoted / actual)">
            {money(job.quotedLabourCost)} / {money(job.actualLabourCost)}
          </Field>
          {showCalculated && (
            <>
              <Field label="Material cost remaining">{money(job.materialCostRemaining)}</Field>
              <Field label="Material % remaining">{percent(job.materialPctRemaining)}</Field>
              <Field label="Est. % of materials received">{percent(job.estimatedPctMaterialsReceived)}</Field>
            </>
          )}
        </Section>

        <Section title="Labour hours">
          <Field label="Quoted hours">
            {job.quotedLabourHours === null ? '—' : job.quotedLabourHours}
          </Field>
          <Field label="Actual hours">
            {job.actualLabourHours === null ? '—' : job.actualLabourHours}
          </Field>
          {showCalculated && (
            <>
              <Field label="Labour cost remaining">{money(job.labourCostRemaining)}</Field>
              <Field label="Labour cost % remaining">{percent(job.labourCostPctRemaining)}</Field>
              <Field label="Labour hours remaining">
                {job.labourHoursRemaining === null ? '—' : job.labourHoursRemaining}
              </Field>
              <Field label="Labour hour % remaining">{percent(job.labourHourPctRemaining)}</Field>
            </>
          )}
        </Section>

        <Section title="Claim progress">
          <Field label="Claim to date">{money(job.claimToDate)}</Field>
          <Field label="Remaining to claim">{money(job.remainingToClaim)}</Field>
          <Field label="% claim remaining">{percent(job.pctClaimRemaining)}</Field>
          {showCalculated && (
            <Field label="Est. % of job complete">{percent(job.estimatedPctJobComplete)}</Field>
          )}
        </Section>

        <Section title="Margin">
          <Field label="Margin to date" warn={job.losingMargin}>
            {percent(job.marginToDate)}
          </Field>
          <Field label="Quoted margin">{percent(job.quotedMargin)}</Field>
          <Field label="GP $/hour">{money(job.gpPerHour)}</Field>
          <Field label="Quoted GP $/hour">{money(job.quotedGpPerHour)}</Field>
        </Section>

        <div className="mt-6 border-t border-white/10 pt-6">
          <ArchiveJobControl job={job} onBack={onBack} />
        </div>
      </div>
    </div>
  )
}
