import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, AlertTriangle, Archive } from 'lucide-react'
import StatusPills from './StatusPills'
import FieldProgressTab from './FieldProgressTab'
import { getAppData } from '../lib/appData'
import { fieldProgress, isStale, toTaskRows } from '../lib/fieldProgress'
import { money, percent, roundHours } from '../lib/format'
import { statusReasons } from '../lib/statusReasons'
import { pollStagedStatus } from '../lib/pollStagedStatus'

import { workerFetch } from '@/lib/workerClient'

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
      const res = await workerFetch(`/archive-job`, {
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

// `negative` marks a value that has gone the wrong way — an over-claim, a
// blown budget. Those printed in the same plain white as everything else,
// so "-$715" and "-2.2%" read as ordinary numbers rather than as the thing
// worth noticing on the page.
function Field({ label, children, warn, negative }) {
  // Label and value on one line rather than stacked. Across four columns the
  // stacked version put a figure a long way from the words that named it, and
  // left so much air between rows that reading eight of them meant scrolling.
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-white/[0.06] py-2.5">
      <span className="text-[13px] text-neutral-400">{label}</span>
      <span
        className={`shrink-0 text-[15px] tabular-nums ${
          warn
            ? 'font-semibold text-amber-400'
            : negative
              ? 'font-semibold text-red-400'
              : 'text-neutral-100'
        }`}
      >
        {children}
      </span>
    </div>
  )
}

// Two columns of rows, so a section of eight figures is four lines deep
// instead of eight.
function Section({ children }) {
  return <div className="grid grid-cols-1 gap-x-10 sm:grid-cols-2">{children}</div>
}

// The headline "can I understand this job in 5 seconds" row — a big
// number plus a progress bar reading straight off the same over/under
// logic the rest of the app already uses (JobTable's CostBar/MarginBar),
// instead of a page full of same-weight label/value pairs where nothing
// stands out. `good` is which direction is favorable — cost/hours want
// LESS of the bar filled to be good, margin wants MORE.
function StatCard({ label, value, formatValue, quoted, formatQuoted, ratio, good }) {
  const hasBar = quoted !== null && quoted !== undefined && ratio !== null
  const clippedRatio = hasBar ? Math.min(Math.max(ratio, 0), 1.5) / 1.5 : 0
  // "low" (cost, hours): under 100% of quoted is fine, over is bad.
  // "high" (margin): at/above the quoted target is fine, well under is bad.
  const overThreshold = good === 'low' ? ratio > 1 : ratio < 0.7
  const nearThreshold = good === 'low' ? ratio >= 0.85 && ratio <= 1 : ratio >= 0.7 && ratio < 1
  const barColor = overThreshold ? 'bg-red-500' : nearThreshold ? 'bg-amber-400' : 'bg-brand-green'
  const valueColor = overThreshold ? 'text-red-400' : 'text-white'

  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-white/[0.06] bg-white/[0.02] p-5">
      <span className="text-[12px] font-medium tracking-wide text-neutral-400 uppercase">{label}</span>
      <span className={`text-2xl font-bold tabular-nums ${valueColor}`}>
        {value === null ? '—' : formatValue(value)}
      </span>
      {hasBar && (
        <>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
            <div
              className={`h-full rounded-full transition-all ${barColor}`}
              style={{ width: `${clippedRatio * 100}%` }}
            />
          </div>
          <span className="text-[12px] tabular-nums text-neutral-400">
            of {formatQuoted ? formatQuoted(quoted) : formatValue(quoted)} quoted
          </span>
        </>
      )}
    </div>
  )
}

function hours(v) {
  return v === null ? '—' : `${roundHours(v)} hrs`
}

// The full breakdown used to sit behind a "Show full breakdown" button, which
// meant a click on every job before you could see any of it, and then a long
// scroll through four stacked sections. Same figures, reached as tabs: nothing
// is hidden behind a toggle, and the one you want is one click, not a scroll.
const TABS = [
  { key: 'cost', label: 'Cost' },
  { key: 'hours', label: 'Hours' },
  { key: 'claims', label: 'Claims' },
  { key: 'margin', label: 'Margin' },
  { key: 'field', label: 'Field' },
]
const TAB_KEY = 'job-detail-tab'

function readTab() {
  try {
    const stored = localStorage.getItem(TAB_KEY)
    return TABS.some((t) => t.key === stored) ? stored : 'cost'
  } catch {
    return 'cost'
  }
}

export default function ProjectDetail({ job, mainSheet, onBack }) {
  const reasons = statusReasons(job)
  // Remembered, because whoever spends their morning checking margins wants
  // the margin tab on the next job too, not to pick it again each time.
  const [tab, setTab] = useState(readTab)

  // Fetched here rather than through useSharedState: that hook reads once
  // with an empty dependency list and is shared with the Upcoming work
  // planning figures, so changing its semantics has blast radius. A fetch
  // keyed on the job number is the right granularity anyway — it re-reads
  // whenever you open a different job, which is the moment the answer
  // changes. Same pattern as JobCompletionChecklistTab.
  // Carries the job it belongs to, so "still loading" is derived from a
  // mismatch rather than set synchronously at the top of the effect — which
  // would cascade a second render on every open. It also means a Refresh
  // keeps the current figures on screen while the new ones arrive, instead
  // of blanking them.
  const [field, setField] = useState({ status: 'loading', jobNumber: null })
  const [fieldReload, setFieldReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      getAppData(`field:${job.jobNumber}`),
      // The catalogue holds the labels; the job record only stores task ids,
      // so a task renamed in the catalogue reads correctly here without every
      // historical record needing a rewrite.
      getAppData('fieldTasks:commercial'),
      getAppData('fieldTasks:residential'),
    ])
      .then(([record, commercial, residential]) => {
        if (cancelled) return
        const catalogue = record?.template === 'residential' ? residential : commercial
        setField({ status: 'ready', jobNumber: job.jobNumber, record, catalogue: catalogue ?? [], asAt: new Date() })
      })
      .catch(() => {
        if (!cancelled) setField({ status: 'error', jobNumber: job.jobNumber })
      })
    return () => {
      cancelled = true
    }
  }, [job.jobNumber, fieldReload])

  const refreshField = useCallback(() => setFieldReload((n) => n + 1), [])

  const fieldState = field.jobNumber === job.jobNumber ? field : { status: 'loading' }

  // Only summarised once there is something to summarise. While it is
  // loading the pill shows nothing at all rather than a placeholder zero —
  // 0% is a claim about work, and "we haven't asked yet" is not that claim.
  const fieldSummary =
    fieldState.status === 'ready' && fieldState.record
      ? {
          ...fieldProgress(toTaskRows(fieldState.record, fieldState.catalogue)),
          stale: isStale(fieldState.record.updatedAt),
          updatedAt: fieldState.record.updatedAt,
        }
      : fieldState.status === 'ready'
        ? { state: 'none' }
        : null

  function selectTab(key) {
    setTab(key)
    try {
      localStorage.setItem(TAB_KEY, key)
    } catch {
      // Preference won't persist; the tab still switches.
    }
  }
  const jobOwner = mainSheet?.jobs?.find((j) => j.jobNumber === job.jobNumber)?.jobOwner

  const costRatio = job.totalQuotedCost ? job.totalActualCost / job.totalQuotedCost : null
  const hoursRatio = job.quotedLabourHours ? job.actualLabourHours / job.quotedLabourHours : null
  const marginRatio = job.quotedMargin ? job.marginToDate / job.quotedMargin : null

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
      </div>

      <div className="rounded-[18px] border border-white/[0.06] bg-[#11161c] p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-neutral-400 tabular-nums">Job {job.jobNumber}</p>
            <h1 className="mt-1 text-3xl font-bold text-white">{job.jobName}</h1>
            <StatusPills job={job} jobOwner={jobOwner} field={fieldSummary} />
          </div>
          {/* This is the quoted price — a reference figure, not a verdict.
              Rendered big and green with no label it read as "this job is
              healthy", which on a job flagged as over quote is precisely
              backwards. Neutral, and labelled. */}
          <div className="text-right">
            <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">
              Quoted price
            </p>
            <p className="mt-0.5 text-3xl font-bold text-white tabular-nums">
              {money(job.quotedPrice)}
            </p>
          </div>
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

        {/* The "5-second read" — everything else below is detail for when
            you want to dig in, not what you need to just check the job. */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            label="Cost"
            value={job.totalActualCost}
            formatValue={money}
            quoted={job.totalQuotedCost}
            ratio={costRatio}
            good="low"
          />
          <StatCard
            label="Hours"
            value={job.actualLabourHours}
            formatValue={hours}
            quoted={job.quotedLabourHours}
            formatQuoted={hours}
            ratio={hoursRatio}
            good="low"
          />
          <StatCard
            label="Margin to date"
            value={job.marginToDate}
            formatValue={percent}
            quoted={job.quotedMargin}
            formatQuoted={percent}
            ratio={marginRatio}
            good="high"
          />
        </div>

        {/* Tab bar. Underline rather than pills: it reads as "these are parts
            of the thing above", which a row of buttons doesn't. */}
        <div className="mt-7 flex gap-1 overflow-x-auto border-b border-white/10">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => selectTab(key)}
              aria-current={tab === key ? 'true' : undefined}
              className={`-mb-px shrink-0 border-b-2 px-4 py-2.5 text-[14px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green ${
                tab === key
                  ? 'border-brand-green text-white'
                  : 'border-transparent text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {tab === 'cost' && (
            <Section>
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
              <Field label="Material cost remaining">{money(job.materialCostRemaining)}</Field>
              <Field label="Material % remaining">{percent(job.materialPctRemaining)}</Field>
              <Field label="Est. % of materials received">{percent(job.estimatedPctMaterialsReceived)}</Field>
            </Section>
          )}

          {tab === 'hours' && (
            <Section>
              <Field label="Quoted hours">
                {job.quotedLabourHours === null ? '—' : roundHours(job.quotedLabourHours)}
              </Field>
              <Field label="Actual hours">
                {job.actualLabourHours === null ? '—' : roundHours(job.actualLabourHours)}
              </Field>
              <Field label="Labour cost remaining">{money(job.labourCostRemaining)}</Field>
              <Field label="Labour cost % remaining">{percent(job.labourCostPctRemaining)}</Field>
              <Field label="Labour hours remaining">
                {job.labourHoursRemaining === null ? '—' : roundHours(job.labourHoursRemaining)}
              </Field>
              <Field label="Labour hour % remaining">{percent(job.labourHourPctRemaining)}</Field>
            </Section>
          )}

          {tab === 'claims' && (
            <Section>
              <Field label="Claim to date">{money(job.claimToDate)}</Field>
              <Field label="Remaining to claim" negative={job.remainingToClaim < 0}>
                {money(job.remainingToClaim)}
              </Field>
              <Field label="% claim remaining" negative={job.pctClaimRemaining < 0}>
                {percent(job.pctClaimRemaining)}
              </Field>
              <Field label="Est. % of job complete">{percent(job.estimatedPctJobComplete)}</Field>
            </Section>
          )}

          {tab === 'margin' && (
            <Section>
              <Field label="Margin to date" warn={job.losingMargin}>
                {percent(job.marginToDate)}
              </Field>
              <Field label="Quoted margin">{percent(job.quotedMargin)}</Field>
              <Field label="GP $/hour">{money(job.gpPerHour)}</Field>
              <Field label="Quoted GP $/hour">{money(job.quotedGpPerHour)}</Field>
            </Section>
          )}

          {tab === 'field' && (
            <FieldProgressTab
              state={fieldState}
              onRefresh={refreshField}
              jobNumber={job.jobNumber}
              jobName={job.jobName}
            />
          )}
        </div>

        <div className="mt-6 border-t border-white/10 pt-6">
          <ArchiveJobControl job={job} onBack={onBack} />
        </div>
      </div>
    </div>
  )
}
