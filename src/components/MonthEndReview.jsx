import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ChevronRight, Circle } from 'lucide-react'
import CompletedJobsUpload from './CompletedJobsUpload'
import { fetchJobCategories } from '../lib/jobCategoryStore'
import { monthName, personMonthly, projectGpPerHour } from '../lib/completedJobPeople'
import { jobsToReview } from '../lib/completedJobReview'
import { cents, money } from '../lib/format'
import { useLocalStorageState } from '../lib/useLocalStorageState'
import { word } from '../lib/words'

// The monthly routine as one page, in order: upload the month, give every job
// a type of work, check what went over quote, see who moved up or down, print
// the report. The first two steps tick themselves from the data; the last
// three are ticked by hand and remembered per month in this browser.
const nzMonth = (offset = 0) => {
  const [y, m] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit' }).format(new Date()).split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 - offset, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
const OVER = 'var(--viz-critical)'

function Step({ n, title, done, auto, detail, children, action, onTick }) {
  return (
    <section className={`rounded-[14px] border p-4 ${done ? 'border-brand-green/30 bg-brand-green/[0.04]' : 'border-white/[0.08] bg-white/[0.02]'}`}>
      <div className="flex items-start gap-3">
        <button type="button" onClick={auto ? undefined : onTick} disabled={auto} aria-pressed={done}
          title={auto ? 'Ticks itself from the data' : done ? 'Un-tick' : 'Mark done'}
          className={`mt-0.5 shrink-0 ${auto ? 'cursor-default' : 'cursor-pointer'}`}>
          {done ? <CheckCircle2 size={22} className="text-brand-green" aria-hidden="true" /> : <Circle size={22} className="text-neutral-600" aria-hidden="true" />}
        </button>
        <div className="min-w-0 flex-1">
          <h2 className={`text-[15px] font-semibold ${done ? 'text-neutral-300' : 'text-white'}`}>
            <span className="mr-2 text-neutral-500">{n}.</span>{title}
          </h2>
          {detail && <p className="mt-0.5 text-[13px] text-neutral-400">{detail}</p>}
          {children && <div className="mt-3">{children}</div>}
        </div>
        {action && (
          <button type="button" onClick={action.onClick}
            className="flex shrink-0 items-center gap-1 rounded-full border border-white/10 px-3.5 py-1.5 text-[13px] font-medium text-neutral-200 hover:border-white/25 hover:text-white">
            {action.label} <ChevronRight size={14} aria-hidden="true" />
          </button>
        )}
      </div>
    </section>
  )
}

export default function MonthEndReview({ completedJobs, onBack, onCompleted, onInsights, onMonthReport }) {
  const loaded = useMemo(() => [...new Set(completedJobs.map((j) => j.month).filter(Boolean))].sort(), [completedJobs])
  // The month to review: the month that just ended, or the latest loaded month if it's newer.
  const lastMonth = nzMonth(1)
  const months = useMemo(() => [...new Set([...loaded, lastMonth])].sort().reverse(), [loaded, lastMonth])
  const [month, setMonth] = useState(() => (loaded.at(-1) && loaded.at(-1) > lastMonth ? loaded.at(-1) : lastMonth))
  const [ticks, setTicks] = useLocalStorageState(`monthEnd.${month}`, {})
  const tick = (k) => setTicks((t) => ({ ...t, [k]: !t[k] }))

  const [categories, setCategories] = useState(null)
  useEffect(() => {
    let live = true
    fetchJobCategories().then((c) => { if (live) setCategories(c ?? {}) }).catch(() => { if (live) setCategories({}) })
    return () => { live = false }
  }, [])

  const jobs = useMemo(() => completedJobs.filter((j) => j.month === month), [completedJobs, month])
  const untyped = categories ? jobs.filter((j) => !categories[j.jobNumber]) : []
  const over = useMemo(() => jobsToReview(jobs), [jobs])
  const people = useMemo(() => {
    const pm = personMonthly(completedJobs.filter((j) => j.type === 'quoted'))
    const prev = pm.months[pm.months.indexOf(month) - 1]
    const rows = pm.people.filter((p) => p.monthly[month]).map((p) => {
      const now = p.monthly[month].weightedGp, before = prev ? p.monthly[prev]?.weightedGp ?? null : null
      return { name: p.name, now, before, delta: now != null && before != null ? now - before : null }
    })
    return { prev, up: rows.filter((r) => r.delta != null && r.delta >= 0).sort((a, b) => b.delta - a.delta), down: rows.filter((r) => r.delta != null && r.delta < 0).sort((a, b) => a.delta - b.delta), newOnly: rows.filter((r) => r.delta == null) }
  }, [completedJobs, month])

  const steps = [
    { key: 'upload', done: jobs.length > 0, auto: true },
    { key: 'types', done: jobs.length > 0 && categories !== null && untyped.length === 0, auto: true },
    { key: 'over', done: !!ticks.over || (jobs.length > 0 && over.length === 0), auto: jobs.length > 0 && over.length === 0 },
    { key: 'people', done: !!ticks.people },
    { key: 'report', done: !!ticks.report },
  ]
  const doneCount = steps.filter((s) => s.done).length

  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-5">
      <nav className="flex items-center gap-1.5 text-sm text-text-muted">
        <button className="transition-colors hover:text-text-primary" onClick={onBack}>Operations overview</button>
        <span aria-hidden="true">/</span>
        <span className="text-text-primary">Month-end review</span>
      </nav>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Month-end review — {monthName(month)}</h1>
          <p className="mt-1 text-sm text-neutral-400">The monthly routine in order. {doneCount} of {steps.length} done.</p>
        </div>
        <label className="flex items-center gap-2 text-[12px] text-neutral-500">
          Month
          <select value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-[13px] font-medium text-white">
            {months.map((m) => <option key={m} value={m}>{monthName(m)}{loaded.includes(m) ? '' : ' — not loaded yet'}</option>)}
          </select>
        </label>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden="true">
        <div className="h-full rounded-full bg-brand-green transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>

      <Step n={1} title={`Upload ${monthName(month)}'s completed jobs`} done={steps[0].done} auto
        detail={jobs.length ? `${jobs.length} completed job${jobs.length === 1 ? '' : 's'} loaded for ${monthName(month)}.` : `Nothing loaded for ${monthName(month)} yet — export the month from Katipolt and upload it here.`}>
        {!jobs.length && <CompletedJobsUpload />}
      </Step>

      <Step n={2} title="Give every job a type of work" done={steps[1].done} auto
        detail={!jobs.length ? 'After the upload.' : categories === null ? 'Checking…' : untyped.length ? `${untyped.length} job${untyped.length === 1 ? '' : 's'} still ${untyped.length === 1 ? 'has' : 'have'} no type of work — the by-type figures leave them out.` : 'Every job has a type of work.'}
        action={jobs.length && untyped.length ? { label: 'Set them', onClick: () => onCompleted({ work: 'Not set' }) } : undefined} />

      <Step n={3} title="Check the jobs that went over quote" done={steps[2].done} auto={steps[2].auto} onTick={() => tick('over')}
        detail={!jobs.length ? 'After the upload.' : over.length ? `${over.length} quoted job${over.length === 1 ? '' : 's'} came in over quote. Open each one, see who worked it and why, then tick this step.` : 'No quoted job came in over quote this month.'}
        action={over.length ? { label: 'Open in Completed jobs', onClick: () => onCompleted({ review: true }) } : undefined}>
        {over.length > 0 && (
          <ul className="flex flex-col gap-1 text-[13px]">
            {over.map(({ job, over: o }) => (
              <li key={job.jobNumber} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium text-white">{job.jobNumber}</span>
                <span className="text-neutral-300">{job.jobName}</span>
                <span style={{ color: OVER }}>{o.map((x) => (x.unit === 'h' ? `${x.label} ${x.quoted} → ${x.actual} h` : `${x.label} ${money(x.quoted)} → ${money(x.actual)}`)).join(' · ')}</span>
                <span className="text-neutral-500">· {word('profitPerHour')} {projectGpPerHour(job) == null ? '—' : cents(projectGpPerHour(job))}</span>
              </li>
            ))}
          </ul>
        )}
      </Step>

      <Step n={4} title="See who moved up or down" done={steps[3].done} onTick={() => tick('people')}
        detail={!jobs.length ? 'After the upload.' : !people.prev ? `No earlier month to compare with yet — ${monthName(month)} is the first month loaded. Have a look at the by-person figures, then tick this step.`
          : `${people.down.length} ${people.down.length === 1 ? 'person is' : 'people are'} below ${monthName(people.prev, 'short')}, ${people.up.length} at or above.`}
        action={jobs.length ? { label: 'Completed insights', onClick: onInsights } : undefined}>
        {jobs.length > 0 && people.prev && (people.down.length > 0 || people.up.length > 0) && (
          <div className="grid grid-cols-1 gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2">
            {people.down.map((p) => <p key={p.name}><span className="text-white">{p.name}</span> <span style={{ color: OVER }}>{money(p.before)} → {money(p.now)}</span></p>)}
            {people.up.map((p) => <p key={p.name}><span className="text-white">{p.name}</span> <span className="text-brand-green">{money(p.before)} → {money(p.now)}</span></p>)}
          </div>
        )}
      </Step>

      <Step n={5} title="Print or send the month report" done={steps[4].done} onTick={() => tick('report')}
        detail={jobs.length ? 'One page: the headline figures, by type of work, by person, over quote, best and worst. Print / PDF or Excel from the report page, then tick this step.' : 'After the upload.'}
        action={jobs.length ? { label: 'Month report', onClick: onMonthReport } : undefined} />
    </div>
  )
}
