import { useEffect, useMemo, useState } from 'react'
import { cents, money, roundHours } from '../lib/format'
import ChartCard from './charts/ChartCard'
import HBarChart from './charts/HBarChart'
import { compactMoney } from './charts/chartScale'
import { ACTUAL, BAD, GOOD } from './charts/colors'
import { monthName, personTotals, projectGpPerHour, projectProfit } from '../lib/completedJobPeople'
import TeamAvatar from './TeamAvatar'
import { teamMember } from '../lib/teamPhotos'
import { typePhoto } from '../lib/typePhotos'
import { jobsToReview } from '../lib/completedJobReview'
import { fetchJobCategories } from '../lib/jobCategoryStore'
import { JOB_CATEGORIES } from '../lib/jobCategories'
import { word } from '../lib/words'

// The Dashboard: four headline figures and three charts, full width, big
// enough to read from across a desk. Deliberately few — the owner's verdict
// on a six-chart grid was "too much and hard to see". Nothing here restates
// a table that exists elsewhere (people are on Employee KPI, capacity on
// Upcoming work).
//
// Colours follow charts/colors.js: blue is what happened, orange is what it
// is compared with, red/green only on a figure or a dot.

const NOT_SET = 'Not set'
const SELECT = 'rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-[13px] font-medium text-white'

// A BI-style tile: label, one big figure, one line under it.
function Kpi({ label, value, sub, tone }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-[14px] border border-white/[0.06] bg-[#11161c] px-4 py-3">
      <span className="truncate text-[11px] font-medium uppercase tracking-wide text-neutral-500">{label}</span>
      <span className="text-[22px] font-semibold tabular-nums leading-tight text-white" style={tone ? { color: tone } : undefined}>{value}</span>
      {sub && <span className="truncate text-[12px] tabular-nums text-neutral-500">{sub}</span>}
    </div>
  )
}

// Profit ÷ hours over a set of completed jobs, weighted by hours.
const rate = (jobs) => {
  const w = jobs.filter((j) => projectGpPerHour(j) !== null)
  const h = w.reduce((t, j) => t + j.hours, 0)
  return h ? w.reduce((t, j) => t + projectProfit(j), 0) / h : null
}
export default function ChartsTab({ jobs, completedJobs = [], onOpenJob, onBack }) {
  // ---- filters: the completed-jobs month and the type of work
  const months = useMemo(() => [...new Set(completedJobs.map((j) => j.month).filter(Boolean))].sort().reverse(), [completedJobs])
  const [month, setMonth] = useState(() => months[0] ?? 'all')
  const [work, setWork] = useState('all')
  const [categories, setCategories] = useState(null)
  useEffect(() => {
    let live = true
    fetchJobCategories().then((c) => { if (live) setCategories(c ?? {}) }).catch(() => { if (live) setCategories({}) })
    return () => { live = false }
  }, [])
  const catOf = (j) => categories?.[j.jobNumber] || NOT_SET
  const completed = useMemo(() => completedJobs
    .filter((j) => month === 'all' || j.month === month)
    .filter((j) => work === 'all' || catOf(j) === work), [completedJobs, month, work, categories]) // eslint-disable-line react-hooks/exhaustive-deps
  const workOptions = useMemo(() => [...JOB_CATEGORIES, NOT_SET].filter((c) => completedJobs.some((j) => catOf(j) === c) || jobs.some((j) => ((j.jobCategory || '').trim() || NOT_SET) === c)), [completedJobs, jobs, categories]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- headline figures
  const over = jobsToReview(completed)

  // ---- 3. completed jobs: profit per hour by type of work
  const overall = rate(completed)
  const profitByType = useMemo(() => {
    const groups = new Map()
    for (const j of completed) { const c = catOf(j); if (!groups.has(c)) groups.set(c, []); groups.get(c).push(j) }
    return [...groups].map(([label, list]) => ({ label, fullLabel: label, jobs: list.length, hours: roundHours(list.reduce((t, j) => t + (j.hours ?? 0), 0)), gp: rate(list) }))
      .filter((r) => r.gp !== null)
      .map((r) => ({ ...r, values: [r.gp], tones: [r.gp < 0 ? 'bad' : overall != null && r.gp >= overall ? 'good' : null] }))
      .sort((a, b) => b.gp - a.gp)
  }, [completed, categories, overall]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- people: each person's figure on the completed quoted jobs shown
  const [personSort, setPersonSort] = useState('weightedGp')
  const [openPerson, setOpenPerson] = useState(null)
  const people = useMemo(() => personTotals(completed).filter((p) => p.weightedGp !== null)
    .sort((a, b) => b[personSort] - a[personSort]), [completed, personSort])
  // The bar and the figure show whatever the rows are sorted by — GP per
  // hour, hours or jobs; sorting by name keeps GP per hour.
  const metric = personSort === 'hours' ? { key: 'hours', fmt: (v) => `${roundHours(v)} h` } : personSort === 'count' ? { key: 'count', fmt: (v) => `${v} job${v === 1 ? '' : 's'}` } : { key: 'weightedGp', fmt: cents }
  const peopleMax = Math.max(0, ...people.map((p) => p[metric.key]))

  // ---- jobs behind a type of work, and the best / worst jobs per hour
  const [openType, setOpenType] = useState(null)
  const typeJobs = useMemo(() => (openType ? completed.filter((j) => catOf(j) === openType).sort((a, b) => (projectGpPerHour(b) ?? -Infinity) - (projectGpPerHour(a) ?? -Infinity)) : []), [completed, openType, categories]) // eslint-disable-line react-hooks/exhaustive-deps
  const bestWorst = useMemo(() => {
    const ranked = completed.filter((j) => projectGpPerHour(j) !== null).sort((a, b) => projectGpPerHour(b) - projectGpPerHour(a))
    const pick = ranked.length > 10 ? [...ranked.slice(0, 5), ...ranked.slice(-5)] : ranked
    // The rule between the two halves: without it the ten read as one ladder.
    const worstFrom = ranked.length > 10 ? 5 : Math.ceil(pick.length / 2)
    return pick.map((j, i) => ({ label: `${j.jobNumber} ${j.jobName}`, fullLabel: `${j.jobNumber} ${j.jobName}`, jobNumber: j.jobNumber,
      ...(i === worstFrom && pick.length > 1 ? { dividerBefore: 'Worst' } : {}),
      values: [projectGpPerHour(j)], tones: [projectGpPerHour(j) < 0 ? 'bad' : overall != null && projectGpPerHour(j) >= overall ? 'good' : null],
      note: `${j.type === 'quoted' ? 'Quoted' : 'Charge-up'} · ${j.hours} h · ${money(projectProfit(j))} profit` }))
  }, [completed, overall])

  const monthLabel = month === 'all' ? 'all months' : monthName(month)

  return (
    <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-5">
      <nav className="flex items-center gap-1.5 text-sm text-text-muted">
        <button className="transition-colors hover:text-text-primary" onClick={onBack}>Operations overview</button>
        <span aria-hidden="true">/</span>
        <span className="text-text-primary">Dashboard</span>
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
          <p className="mt-1 text-sm text-neutral-400">What the finished jobs paid per hour — by person, by type of work, and job by job. Click anything to see what is behind it.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-[12px] text-neutral-500">
            Completed in
            <select value={month} onChange={(e) => setMonth(e.target.value)} className={SELECT}>
              {months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
              <option value="all">All months</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-[12px] text-neutral-500">
            {word('typeOfWork')}
            <select value={work} onChange={(e) => setWork(e.target.value)} className={SELECT}>
              <option value="all">All</option>
              {workOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>
      </div>

      {/* headline figures */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi label={`${word('profitPerHour')} · completed jobs`} value={overall == null ? '—' : `${cents(overall)}/hr`} sub={`${money(completed.reduce((t, j) => t + (projectProfit(j) ?? 0), 0))} profit ÷ ${roundHours(completed.reduce((t, j) => t + (j.hours ?? 0), 0))} h`} />
        <Kpi label={`Jobs completed · ${monthLabel}`} value={completed.length} sub={`${completed.filter((j) => j.type === 'chargeup').length} charge-up · ${completed.filter((j) => j.type === 'quoted').length} quoted`} />
        <Kpi label="Over quote" value={over.length} tone={over.length ? BAD : undefined} sub={`of ${completed.filter((j) => j.type === 'quoted').length} quoted job${completed.filter((j) => j.type === 'quoted').length === 1 ? '' : 's'}`} />
        <Kpi label="Best-paying type of work" value={profitByType[0] ? `${cents(profitByType[0].gp)}/hr` : '—'} tone={profitByType[0] ? GOOD : undefined} sub={profitByType[0] ? `${profitByType[0].label} · ${profitByType[0].jobs} job${profitByType[0].jobs === 1 ? '' : 's'}` : 'no completed jobs yet'} />
      </div>

      <div className="flex flex-col gap-5">
        {/* By type of work: a bar per type with a photo of that kind of job, from
            the company's own projects. Click a type for its jobs. */}
        <ChartCard title={`${word('profitPerHour')} by type of work — completed jobs`}
          footnote={`${monthLabel}${work === 'all' ? '' : ` · ${work}`}. Profit ÷ hours worked, weighted by hours. Green is at or above the overall ${overall == null ? '' : cents(overall) + '/hr'}; red lost money. The pictures are Cassidy-Davies jobs of that kind, from cdelectrical.co.nz. Click a type to see its jobs.`}
          table={<table><caption>Profit per hour by type of work, completed jobs</caption><tbody>{profitByType.map((r) => <tr key={r.label}><th scope="row">{r.label}</th><td>{r.jobs} job{r.jobs === 1 ? '' : 's'}</td><td>{r.hours} h</td><td>{cents(r.gp)}/hr</td></tr>)}</tbody></table>}>
          {profitByType.length === 0 ? <p className="py-8 text-center text-[13px] text-neutral-400">No completed jobs for this month and type of work.</p> : (
            <ul className="flex flex-col gap-1">
              {profitByType.map((r) => {
                const isOpen = openType === r.label
                const max = Math.max(0, ...profitByType.map((x) => x.gp))
                const w = max > 0 ? Math.max(1.5, (Math.max(0, r.gp) / max) * 100) : 0
                const tone = r.gp < 0 ? BAD : overall != null && r.gp >= overall ? GOOD : ACTUAL
                const pic = typePhoto(r.label)
                return (
                  <li key={r.label}>
                    <button type="button" onClick={() => setOpenType(isOpen ? null : r.label)} aria-expanded={isOpen}
                      className={`grid w-full grid-cols-[auto_minmax(150px,240px)_minmax(0,1fr)_auto] items-center gap-4 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-white/[0.04] ${isOpen ? 'bg-white/[0.04]' : ''}`}>
                      <span className="flex h-11 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-brand-green/15 text-[12px] font-semibold text-brand-green">
                        {pic ? <img src={pic.photo} alt="" loading="lazy" className="h-full w-full object-cover" /> : r.label.split(/\s+/).map((x) => x[0]).join('').slice(0, 3)}
                      </span>
                      <span className="flex min-w-0 flex-col leading-tight">
                        <span className="truncate text-[14px] font-medium text-white">{r.label}</span>
                        <span className="truncate text-[11.5px] text-neutral-500">{r.jobs} job{r.jobs === 1 ? '' : 's'} · {r.hours} h{pic ? ` · ${pic.project}` : ''}</span>
                      </span>
                      <span className="h-3 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden="true">
                        <span className="block h-full rounded-full" style={{ width: `${w}%`, background: tone }} />
                      </span>
                      <span className="w-24 text-right text-[15px] font-semibold tabular-nums" style={{ color: r.gp < 0 ? BAD : r.gp >= (overall ?? Infinity) ? GOOD : 'var(--text-primary)' }}>{cents(r.gp)}/hr</span>
                    </button>
                    {isOpen && (
                      <div className="ml-20 mr-2 mb-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                        {typeJobs.map((j) => (
                          <button type="button" key={j.jobNumber} onClick={() => onOpenJob?.(j.jobNumber)} title="Open on Completed jobs"
                            className="grid w-full grid-cols-[4.5rem_minmax(0,1fr)_5.5rem_4.5rem_6rem] gap-x-4 rounded py-0.5 text-left text-[13px] tabular-nums hover:bg-white/[0.05]">
                            <span className="text-neutral-400">{j.jobNumber}</span><span className="truncate text-neutral-200">{j.jobName}</span>
                            <span className="text-neutral-400">{j.type === 'quoted' ? 'Quoted' : 'Charge-up'}</span><span className="text-right text-neutral-300">{j.hours} h</span>
                            <span className="text-right font-medium" style={{ color: projectGpPerHour(j) == null ? undefined : projectGpPerHour(j) < 0 ? BAD : 'var(--text-primary)' }}>{projectGpPerHour(j) == null ? '—' : cents(projectGpPerHour(j))}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </ChartCard>

        {/* Employee KPI: a bar per person, their photo beside it. Click a person for their jobs. */}
        <section className="rounded-[18px] border border-white/[0.06] bg-[#11161c] p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[17px] font-semibold text-neutral-100">Employee KPI — {metric.key === 'hours' ? 'Hours' : metric.key === 'count' ? 'Jobs' : word('personGpHour')}</h2>
              <p className="mt-0.5 text-[12px] text-neutral-400">{monthLabel}{work === 'all' ? '' : ` · ${work}`} · completed quoted jobs. Click a person to see the jobs behind their figure.</p>
            </div>
            <div className="flex items-center gap-1.5" role="group" aria-label="Sort people by">
              {[['weightedGp', word('personGpHour')], ['hours', 'Hours'], ['count', 'Jobs']].map(([k, label]) => (
                <button key={k} type="button" onClick={() => setPersonSort(k)} aria-pressed={personSort === k}
                  className={`rounded-full border px-3 py-1 text-[12px] font-medium transition-colors ${personSort === k ? 'border-brand-green/50 bg-brand-green/10 text-brand-green' : 'border-white/10 text-neutral-400 hover:border-white/20 hover:text-white'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {people.length === 0 ? <p className="py-8 text-center text-[13px] text-neutral-400">No completed quoted jobs for this month and type of work.</p> : (
            <ul className="mt-4 flex flex-col gap-1">
              {people.map((p) => {
                const isOpen = openPerson === p.name
                const v = p[metric.key]
                const w = peopleMax > 0 ? Math.max(1.5, (Math.max(0, v) / peopleMax) * 100) : 0
                const tone = v < 0 ? BAD : ACTUAL
                return (
                  <li key={p.name}>
                    <button type="button" onClick={() => setOpenPerson(isOpen ? null : p.name)} aria-expanded={isOpen}
                      className={`grid w-full grid-cols-[auto_minmax(140px,220px)_minmax(0,1fr)_auto] items-center gap-4 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/[0.04] ${isOpen ? 'bg-white/[0.04]' : ''}`}>
                      <TeamAvatar name={p.name} size={40} />
                      <span className="flex min-w-0 flex-col leading-tight">
                        <span className="truncate text-[14px] font-medium text-white">{p.name}</span>
                        <span className="truncate text-[11.5px] text-neutral-500">{teamMember(p.name)?.role ?? `${p.count} job${p.count === 1 ? '' : 's'}`} · {p.hours} h</span>
                      </span>
                      <span className="h-3 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden="true">
                        <span className="block h-full rounded-full transition-[width]" style={{ width: `${w}%`, background: tone }} />
                      </span>
                      <span className="w-24 text-right text-[15px] font-semibold tabular-nums" style={{ color: v < 0 ? BAD : 'var(--text-primary)' }}>{metric.fmt(v)}</span>
                    </button>
                    {isOpen && (
                      <div className="ml-14 mr-2 mb-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                        <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_4.5rem_6rem] gap-x-4 text-[11px] uppercase tracking-wide text-neutral-500"><span>Job #</span><span>Job</span><span className="text-right">Hours</span><span className="text-right">{word('personGpHour')}</span></div>
                        {p.jobs.map(({ job, hours, part }) => (
                          <button type="button" key={job.jobNumber} onClick={() => onOpenJob?.(job.jobNumber)} title="Open on Completed jobs"
                            className="grid w-full grid-cols-[4.5rem_minmax(0,1fr)_4.5rem_6rem] gap-x-4 rounded py-0.5 text-left text-[13px] tabular-nums hover:bg-white/[0.05]">
                            <span className="text-neutral-400">{job.jobNumber}</span><span className="truncate text-neutral-200">{job.jobName}</span>
                            <span className="text-right text-neutral-300">{hours} h</span><span className="text-right text-white">{cents(part)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <ChartCard title="Best and worst jobs per hour — completed jobs"
          footnote={`${monthLabel}. The five that paid best per hour and the five that paid worst. Click a bar to open the job on Completed jobs.`}
          table={<table><caption>Best and worst jobs per hour</caption><tbody>{bestWorst.map((r) => <tr key={r.label}><th scope="row">{r.label}</th><td>{r.note}</td><td>{cents(r.values[0])}/hr</td></tr>)}</tbody></table>}>
          <HBarChart rows={bestWorst} series={[{ name: word('profitPerHour'), color: ACTUAL }]} labelWidth={230} valueFormat={(v) => `${cents(v)}/hr`} axisFormat={compactMoney}
            onSelect={(r) => onOpenJob?.(r.jobNumber)} emptyMessage="No completed jobs with hours for this month." />
        </ChartCard>
      </div>
    </div>
  )
}
