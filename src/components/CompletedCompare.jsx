import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { cents, money, percent } from '../lib/format'
import { contributors } from '../lib/completedJobPeople'
import { overruns } from '../lib/completedJobReview'
import { workerFetch } from '@/lib/workerClient'

// Ticked completed jobs side by side: the figures that say whether a job went
// well, a rule-of-thumb verdict for each, who put hours into which job, and an
// AI-written summary on request (Gemini, via the upload worker's /job-summary —
// read only, sent just the figures shown here).

const TYPE_LABEL = { quoted: 'Quoted', chargeup: 'Charge-up' }
const pct = (v) => (v == null ? '—' : percent(v))
const h = (v) => (v == null ? '—' : `${Math.round(v * 100) / 100} h`)

// The same yardstick the AI prompt is given, so the two agree on the easy cases.
//   Quoted:    good = within quoted hours and costs, and margin to date at or
//              above quoted; poor = well over (hours >10% or costs), margin 5+
//              points short, or GP/hr below zero; mixed = in between.
//   Charge-up: poor = lost money or more hours unsold than sold; mixed = some
//              unsold hours; good = everything worked was charged.
function verdict(job) {
  if (job.type === 'quoted') {
    const over = overruns(job)
    const qm = job.pl?.quotedMargin, am = job.pl?.marginToDate
    const hoursOver = job.quotedHours ? (job.hours - job.quotedHours) / job.quotedHours : 0
    const costOver = over.some((o) => o.key !== 'hours')
    const marginShort = qm != null && am != null ? qm - am : 0
    if ((job.gpPerHour ?? 0) < 0 || hoursOver > 0.1 || costOver || marginShort > 0.05) return 'poor'
    if (!over.length && marginShort <= 0) return 'good'
    return 'mixed'
  }
  const unsold = job.unsoldHours ?? 0
  if ((job.profit ?? 0) < 0 || unsold > (job.hours ?? 0)) return 'poor'
  if (unsold > 0) return 'mixed'
  return 'good'
}

const VERDICT = {
  good: { label: 'Did well', color: 'var(--brand-green)' },
  mixed: { label: 'Mixed', color: 'var(--viz-warning, #d97706)' },
  poor: { label: 'Needs a look', color: 'var(--viz-critical)' },
}
function Verdict({ v }) {
  const c = VERDICT[v]
  return (
    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap"
      style={{ color: c.color, background: `color-mix(in srgb, ${c.color} 15%, transparent)` }}>{c.label}</span>
  )
}

const ROWS = [
  { label: 'Type', get: (j) => TYPE_LABEL[j.type] },
  { label: 'GP/hr', get: (j) => (j.gpPerHour == null ? '—' : `${cents(j.gpPerHour)}/hr`), strong: true },
  { label: 'Quoted h', get: (j) => h(j.quotedHours) },
  { label: 'Actual h', get: (j) => h(j.hours) },
  {
    label: 'Hours vs quote',
    get: (j) => {
      if (j.quotedHours == null) return '—'
      const d = Math.round((j.quotedHours - j.hours) * 100) / 100
      const p = j.quotedHours ? ` (${d >= 0 ? '' : '−'}${Math.abs(Math.round((d / j.quotedHours) * 100))}%)` : ''
      return <span className={d > 0 ? 'text-brand-green' : d < 0 ? 'text-red-400' : ''}>{d > 0 ? '+' : ''}{d} h{p}</span>
    },
  },
  { label: 'Labour cost — quoted', get: (j) => (j.labour?.quotedCost == null ? '—' : money(j.labour.quotedCost)) },
  { label: 'Labour cost — actual', get: (j) => (j.labour?.actualCost == null ? '—' : money(j.labour.actualCost)) },
  { label: 'Total cost — quoted', get: (j) => (j.pl?.quotedCost == null ? '—' : money(j.pl.quotedCost)) },
  { label: 'Total cost — actual', get: (j) => (j.pl?.actualCost == null ? '—' : money(j.pl.actualCost)) },
  { label: 'Quoted profit · margin', get: (j) => (j.pl?.quotedProfit == null ? '—' : `${money(j.pl.quotedProfit)} · ${pct(j.pl.quotedMargin)}`) },
  { label: 'Profit · margin to date', get: (j) => (j.pl?.profitToDate == null ? '—' : `${money(j.pl.profitToDate)} · ${pct(j.pl.marginToDate)}`) },
  { label: 'Rule check', get: (j) => <Verdict v={verdict(j)} /> },
]

// The figures sent for the AI summary — what's on screen, nothing more. Each
// person's totals across the jobs are worked out here, so the model only ever
// quotes numbers and never does the arithmetic (it gets it wrong).
function summaryPayload(jobs, peopleRows) {
  const perJob = jobs.map((j) => ({
    jobNumber: j.jobNumber,
    jobName: j.jobName,
    type: j.type,
    gpPerHour: j.gpPerHour,
    quotedHours: j.quotedHours ?? null,
    actualHours: j.hours,
    unsoldHours: j.unsoldHours ?? null,
    labourCostQuoted: j.labour?.quotedCost ?? null,
    labourCostActual: j.labour?.actualCost ?? null,
    labourProfit: j.type === 'quoted' ? j.profit : null,
    totalCostQuoted: j.pl?.quotedCost ?? null,
    totalCostActual: j.pl?.actualCost ?? null,
    quotedProfit: j.pl?.quotedProfit ?? null,
    // margins as percentages (44.34), so the summary quotes them as people read them
    quotedMarginPercent: j.pl?.quotedMargin == null ? null : Math.round(j.pl.quotedMargin * 10000) / 100,
    profitToDate: j.pl?.profitToDate ?? null,
    marginToDatePercent: j.pl?.marginToDate == null ? null : Math.round(j.pl.marginToDate * 10000) / 100,
    people: contributors(j).worked.map((p) => ({ name: p.name, hours: p.hours, part: j.type === 'quoted' ? Math.round(p.gpTimesHours * 100) / 100 : null })),
  }))
  const r2 = (v) => Math.round(v * 100) / 100
  return {
    jobs: perJob,
    peopleAcrossTheseJobs: peopleRows.map((p) => ({
      name: p.name,
      totalHours: r2(p.hours),
      jobs: Object.keys(p.perJob),
      totalPartOnQuotedJobs: p.partHours ? r2(p.part) : null,
      gpPerHourOnQuotedJobs: p.partHours ? r2(p.part / p.partHours) : null,
    })),
  }
}

export default function CompletedCompare({ jobs }) {
  const [ai, setAi] = useState({ status: 'idle' }) // idle | loading | done | error
  const [aiFor, setAiFor] = useState('')
  const key = jobs.map((j) => j.jobNumber).join(',')
  const stale = ai.status === 'done' && aiFor !== key

  // People across the ticked jobs: hours (and, on quoted jobs, their part) per job.
  const people = new Map()
  for (const j of jobs) {
    for (const p of contributors(j).worked) {
      const t = people.get(p.name) ?? { name: p.name, perJob: {}, hours: 0, part: 0, partHours: 0 }
      t.perJob[j.jobNumber] = { hours: p.hours, part: j.type === 'quoted' ? p.gpTimesHours : null }
      t.hours += p.hours
      if (j.type === 'quoted') { t.part += p.gpTimesHours; t.partHours += p.hours }
      people.set(p.name, t)
    }
  }
  const peopleRows = [...people.values()].sort((a, b) => b.hours - a.hours)
  const shared = peopleRows.filter((p) => Object.keys(p.perJob).length > 1)

  async function summarise() {
    setAi({ status: 'loading' })
    setAiFor(key)
    try {
      const res = await workerFetch('/job-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(summaryPayload(jobs, peopleRows)),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) setAi({ status: 'error', message: data?.message ?? `Request failed (${res.status}).` })
      else setAi({ status: 'done', summary: data.summary })
    } catch (err) {
      setAi({ status: 'error', message: `Could not reach the AI service: ${String(err.message ?? err)}` })
    }
  }

  const byNumber = Object.fromEntries(jobs.map((j) => [j.jobNumber, j]))
  return (
    <div id="completed-compare" className="mt-4 flex flex-col gap-4 rounded-[14px] border border-white/[0.08] bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-medium text-white">Compare {jobs.length} selected job{jobs.length === 1 ? '' : 's'}</h3>
          {shared.length > 0 && (
            <p className="mt-0.5 text-[12px] text-neutral-400">
              Same people on more than one of these: {shared.map((p) => p.name).join(', ')}
            </p>
          )}
        </div>
        <button type="button" onClick={summarise} disabled={ai.status === 'loading'}
          className="inline-flex items-center gap-1.5 rounded-full border border-brand-green/50 bg-brand-green/10 px-3.5 py-1.5 text-[13px] font-medium text-brand-green hover:bg-brand-green/15 disabled:opacity-60">
          <Sparkles size={14} aria-hidden="true" />
          {ai.status === 'loading' ? 'Writing summary…' : ai.status === 'done' ? 'Summarise again' : 'AI summary'}
        </button>
      </div>

      <div className="table-scroll">
        <table className="data-table data-table--compact">
          <thead>
            <tr>
              <th />
              {jobs.map((j) => (
                <th key={j.jobNumber} className="num" title={j.jobName}>
                  <span className="block normal-case text-white">{j.jobNumber}</span>
                  <span className="block max-w-[11rem] truncate text-[11px] normal-case">{j.jobName}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.label}>
                <td className="text-neutral-400">{r.label}</td>
                {jobs.map((j) => <td key={j.jobNumber} className={`num ${r.strong ? 'font-medium text-white' : ''}`}>{r.get(j)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {peopleRows.length > 0 && (
        <div className="table-scroll">
          <p className="mb-1 text-[12px] font-medium text-neutral-300">Who worked on them</p>
          <table className="data-table data-table--compact">
            <thead>
              <tr>
                <th>Person</th>
                {jobs.map((j) => <th key={j.jobNumber} className="num">{j.jobNumber}</th>)}
                <th className="num">Total h</th>
                <th className="num">GP/hr (quoted jobs)</th>
              </tr>
            </thead>
            <tbody>
              {peopleRows.map((p) => (
                <tr key={p.name}>
                  <td>{p.name}</td>
                  {jobs.map((j) => {
                    const c = p.perJob[j.jobNumber]
                    return (
                      <td key={j.jobNumber} className="num">
                        {c ? <>{c.hours} h{c.part != null && <span className="ml-1 text-[11px] text-neutral-500">{cents(c.part)}</span>}</> : <span className="text-neutral-600">—</span>}
                      </td>
                    )
                  })}
                  <td className="num font-medium">{Math.round(p.hours * 100) / 100} h</td>
                  <td className="num font-medium">{p.partHours ? `${cents(p.part / p.partHours)}/hr` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[11px] text-neutral-500">The small figure is their part of that job&apos;s labour profit (the job&apos;s GP/hr × their hours) — quoted jobs only.</p>
        </div>
      )}

      {ai.status === 'error' && <p className="text-[13px] text-red-400">{ai.message}</p>}
      {ai.status === 'done' && (
        <div className="rounded-[12px] border border-brand-green/30 bg-brand-green/[0.04] p-4 text-[13px] leading-relaxed">
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-brand-green">
            <Sparkles size={12} aria-hidden="true" /> AI summary{stale && ' — for an earlier selection, summarise again'}
          </p>
          <p className="text-[14px] font-medium text-white">{ai.summary.headline}</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {ai.summary.jobs.map((j) => (
              <li key={j.jobNumber} className="flex flex-wrap items-baseline gap-2">
                <Verdict v={VERDICT[j.verdict] ? j.verdict : 'mixed'} />
                <span className="font-medium text-white">{j.jobNumber}{byNumber[j.jobNumber] ? ` ${byNumber[j.jobNumber].jobName}` : ''}</span>
                <span className="text-neutral-300">— {j.note}</span>
              </li>
            ))}
          </ul>
          {ai.summary.people?.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1 text-neutral-300">
              {ai.summary.people.map((p) => <li key={p.name}><span className="font-medium text-white">{p.name}:</span> {p.note}</li>)}
            </ul>
          )}
          <p className="mt-3 text-neutral-200">{ai.summary.overall}</p>
          {ai.summary.nextTime && <p className="mt-2 text-neutral-300"><span className="font-medium text-white">Next time:</span> {ai.summary.nextTime}</p>}
          <p className="mt-3 text-[11px] text-neutral-500">Written by AI from the figures above — check anything important against the P&amp;L.</p>
        </div>
      )}
    </div>
  )
}
