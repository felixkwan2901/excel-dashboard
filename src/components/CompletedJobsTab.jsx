import { Fragment, useEffect, useMemo, useState } from 'react'
import { Users } from 'lucide-react'
import { money } from '../lib/format'

// GP/hr and per-person figures are often a few dollars, so show cents.
const CENTS = new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const cents = (v) => (v == null ? '—' : CENTS.format(Math.round(v * 100) === 0 ? 0 : v))
import CollapsibleSection from './CollapsibleSection'
import { useLocalStorageState } from '../lib/useLocalStorageState'
import { fetchJobOwners, saveJobOwner } from '../lib/jobOwnerStore'
import { fetchJobCategories, saveJobCategory } from '../lib/jobCategoryStore'
import { OwnerCell, CategoryCell } from './JobTable'
import { contributors, personTotals } from '../lib/completedJobPeople'

// Loaded by scripts/lib/completed-job.mjs — labour only: a quoted job's profit is
// its Labour Quoted Cost − Labour Actual Cost, a charge-up job's is Labour Actual
// Sell − Labour Actual Cost, each over the job's actual hours. Sorted by GP/hour by default: the whole point of this tab
// is spotting which finished jobs actually paid well per hour worked,
// which a plain "most profitable" or "most recent" sort wouldn't surface —
// a small quick job can easily out-earn a big one per hour.
const SORT_OPTIONS = [
  { key: 'gpPerHour', label: 'GP $/hr' },
  { key: 'profit', label: 'Labour profit' },
  { key: 'hours', label: 'Actual h' },
  { key: 'quotedHours', label: 'Quoted h' },
  { key: 'hoursDiff', label: 'Difference h' },
  { key: 'addedAt', label: 'Date added' },
]
// Every column of the table sorts; text columns start A–Z, numbers high to low.
const TEXT_SORTS = new Set(['jobName', 'type', 'workedBy', 'category', 'owner'])
const COLUMNS = [
  { key: 'jobNumber', label: 'Job #' },
  { key: 'jobName', label: 'Job name' },
  { key: 'type', label: 'Type' },
  ...SORT_OPTIONS.slice(0, 5).map((c) => ({ ...c, num: true })),
  { key: 'workedBy', label: 'Worked by' },
  { key: 'category', label: 'Type of work' },
  { key: 'owner', label: 'Owner' },
  ...SORT_OPTIONS.slice(5).map((c) => ({ ...c, num: true })),
]

// Difference = quoted − actual hours. A charge-up job's quoted hours are Sold +
// Unsold and its actual hours are Sold, so its difference is its Unsold hours.
const hoursDiff = (j) => (j.quotedHours == null ? null : Math.round((j.quotedHours - j.hours) * 100) / 100)
function DiffHours({ job }) {
  const d = hoursDiff(job)
  if (d === null) return <span className="text-neutral-500">—</span>
  return <span className={d > 0 ? 'text-brand-green' : d < 0 ? 'text-red-400' : 'text-neutral-400'}>{d > 0 ? '+' : ''}{d}</span>
}

const TYPE_LABEL = { quoted: 'Quoted', chargeup: 'Charge-up' }

// Jobs worked by more than one person get the chart blue — a tinted row with a
// blue edge and a people tag — so team jobs stand out from one-person ones at a
// glance. Green is already taken by selection and the type switch.
const TEAM = 'var(--viz-1)'
const TEAM_TINT = 'color-mix(in srgb, var(--viz-1) 7%, transparent)'
const isTeam = (job) => contributors(job).worked.length > 1

function WorkedBy({ job }) {
  const people = contributors(job).worked
  if (!people.length) return <span className="text-neutral-500">—</span>
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="text-neutral-200">{people[0].name}</span>
      {people.length > 1 && (
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={{ color: TEAM, background: 'color-mix(in srgb, var(--viz-1) 14%, transparent)' }}
          title={people.map((p) => p.name).join(', ')}
        >
          <Users size={12} aria-hidden="true" />
          {people.length} people
        </span>
      )}
    </span>
  )
}

const GRID = 'grid grid-cols-[minmax(0,1.6fr)_minmax(0,1.6fr)_4rem_3rem_6rem] gap-x-4'
const GRID_ONE = 'grid grid-cols-[minmax(0,1.6fr)_minmax(0,1.6fr)_4rem_3rem] gap-x-4'

// How the job's labour profit was worked out, straight from its P&L export.
function LabourSum({ job }) {
  const l = job.labour
  if (!l) return null
  const [a, b, aLabel, bLabel] = job.type === 'quoted'
    ? [l.quotedCost, l.actualCost, 'quoted labour cost', 'actual labour cost']
    : [l.actualSell, l.actualCost, 'actual labour sell', 'actual labour cost']
  return (
    <p className="text-[12px] tabular-nums text-neutral-400">
      {money(a)} {aLabel} − {money(b)} {bLabel} = <span className="text-neutral-200">{cents(job.profit)}</span> labour profit
      {' '}÷ {job.hours} actual h{job.type === 'chargeup' ? ' (sold)' : ''} = <span className="font-medium text-white">{cents(job.gpPerHour)}/hr</span>
    </p>
  )
}

function Breakdown({ job }) {
  const { worked: people, adjustments } = contributors(job)
  if (!people.length) {
    return <div className="flex flex-col gap-2.5"><LabourSum job={job} /><p className="text-[13px] text-neutral-500">No per-person hours for this job — its timesheet export wasn&apos;t included.</p></div>
  }
  return (
    <div className="flex flex-col gap-2.5">
      <LabourSum job={job} />
      <p className="text-[12px] text-neutral-500">
        {people.length === 1
          ? 'One person did all the hours on this job.'
          : `${people.length} people worked on this job — each person's part is the job's ${cents(job.gpPerHour)}/hr × their hours.`}
      </p>
      {people.length > 1 && (
        <div className={`${GRID} text-[11px] uppercase tracking-wide text-neutral-500`}>
          <span>Person</span>
          <span />
          <span className="text-right">Hours</span>
          <span className="text-right">Share</span>
          <span className="text-right">GP/hr × hours</span>
        </div>
      )}
      {people.map((p, i) => (
        <div key={p.name} className={`${people.length > 1 ? GRID : GRID_ONE} items-center text-[13px]`}>
          <span className="truncate text-neutral-100">
            {p.name}
            {p.afterHours && <span className="ml-1.5 text-[11px] text-neutral-500">incl. after-hours/overtime</span>}
            {i === 0 && people.length > 1 && (
              <span className="ml-2 rounded-full border border-brand-green/40 px-2 py-0.5 text-[11px] text-brand-green">Most hours</span>
            )}
          </span>
          <span className="h-2 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden="true">
            <span className="block h-full rounded-full bg-brand-green" style={{ width: `${Math.max(2, p.share * 100)}%` }} />
          </span>
          <span className="text-right tabular-nums text-neutral-300">{Math.round(p.hours * 100) / 100} h</span>
          <span className="text-right tabular-nums text-neutral-400">{Math.round(p.share * 100)}%</span>
          {people.length > 1 && <span className="text-right tabular-nums font-medium text-white">{cents(p.gpTimesHours)}</span>}
        </div>
      ))}
      {adjustments.map((p) => (
        <p key={p.name} className="text-[12px] text-neutral-500">
          {p.name}: {p.hours} h adjustment on the invoice — not counted in the split.
        </p>
      ))}
    </div>
  )
}

// Charge-up and quoted GP/hr aren't measured the same way (labour sell − cost vs
// quoted − actual labour cost), and a 15-minute callout can top the
// list over a 70-hour build — so each type gets its own view and its own overall
// rate: total profit ÷ total hours, which weights every job by the time it took.
const TYPE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'chargeup', label: 'Charge-up' },
  { key: 'quoted', label: 'Quoted' },
]

function typeStats(jobs) {
  const profit = jobs.reduce((sum, j) => sum + (j.profit ?? 0), 0)
  const hours = jobs.reduce((sum, j) => sum + (j.hours ?? 0), 0)
  return { count: jobs.length, profit, hours: Math.round(hours * 100) / 100, gp: hours ? profit / hours : null }
}

function TypeSummary({ type, jobs, active, onSelect }) {
  const st = typeStats(jobs)
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={`flex min-w-0 flex-1 flex-col gap-1 rounded-[18px] border p-5 text-left transition-colors ${
        active ? 'border-brand-green/50 bg-brand-green/[0.06]' : 'border-white/[0.06] bg-[#11161c] hover:border-white/20'
      }`}
    >
      <span className="text-[12px] font-medium uppercase tracking-wide text-neutral-400">
        {TYPE_LABEL[type]} · {st.count} job{st.count === 1 ? '' : 's'}
      </span>
      <span className="text-2xl font-semibold tabular-nums text-white">{st.gp === null ? '—' : `${cents(st.gp)}/hr`}</span>
      <span className="text-[12px] tabular-nums text-neutral-500">
        {money(st.profit)} labour profit ÷ {st.hours} actual h
      </span>
    </button>
  )
}

const PERSON_COLS = [
  { key: 'count', label: 'Jobs' },
  { key: 'hours', label: 'Hours' },
  { key: 'profit', label: 'Labour profit' },
  { key: 'gpPerHour', label: 'GP $/hr' },
]

function PeopleSummary({ jobs, scope }) {
  const [sort, setSort] = useState({ key: 'gpPerHour', dir: -1 })
  const [open, setOpen] = useState(() => new Set())
  const people = useMemo(() => personTotals(jobs).sort((a, b) =>
    sort.key === 'name' ? a.name.localeCompare(b.name) * sort.dir : ((a[sort.key] ?? 0) - (b[sort.key] ?? 0)) * sort.dir), [jobs, sort])
  const toggle = (name) => setOpen((prev) => { const next = new Set(prev); next.has(name) ? next.delete(name) : next.add(name); return next })
  const sortBy = (key) => setSort((prev) => (prev.key === key ? { key, dir: -prev.dir } : { key, dir: key === 'name' ? 1 : -1 }))
  const arrow = (key) => (sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : '')

  return (
    <CollapsibleSection
      className="rounded-[18px] border border-white/[0.06] bg-[#11161c] p-6"
      storageKey="completed-jobs.people"
      title={`By person — ${people.length} ${people.length === 1 ? 'person' : 'people'}`}
      description={`Each person's hours and their part of the labour profit (each job's GP/hr × their hours) across ${scope}, summed. GP/hr = their labour profit ÷ their hours. Click a person to see their jobs.`}
    >
      <div className="table-scroll mt-2">
        <table className="data-table">
          <thead>
            <tr>
              <th className="sortable" onClick={() => sortBy('name')}
                aria-sort={sort.key === 'name' ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>Person{arrow('name')}</th>
              {PERSON_COLS.map((c) => (
                <th key={c.key} className="num sortable" onClick={() => sortBy(c.key)}
                  aria-sort={sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                  {c.label}{arrow(c.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.map((p) => {
              const isOpen = open.has(p.name)
              return (
                <Fragment key={p.name}>
                  <tr className="cursor-pointer" tabIndex={0} aria-expanded={isOpen} onClick={() => toggle(p.name)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(p.name) } }}>
                    <td>
                      <span className={`mr-2 inline-block text-neutral-500 transition-transform ${isOpen ? 'rotate-90' : ''}`} aria-hidden="true">›</span>
                      {p.name}
                    </td>
                    <td className="num">{p.count}</td>
                    <td className="num">{p.hours}</td>
                    <td className="num">{cents(p.profit)}</td>
                    <td className="num font-medium">{p.gpPerHour === null ? '—' : `${cents(p.gpPerHour)}/hr`}</td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={5} className="bg-white/[0.02]">
                        <div className="flex max-w-3xl flex-col gap-1.5 py-2 pl-6 text-[13px]">
                          <div className="grid grid-cols-[4rem_minmax(0,1fr)_5rem_4rem_6rem] gap-x-4 text-[11px] uppercase tracking-wide text-neutral-500">
                            <span>Job #</span><span>Job name</span><span className="text-right">GP/hr</span><span className="text-right">Hours</span><span className="text-right">Their part</span>
                          </div>
                          {p.jobs.map(({ job, hours, part }) => (
                            <div key={job.jobNumber} className="grid grid-cols-[4rem_minmax(0,1fr)_5rem_4rem_6rem] gap-x-4 tabular-nums">
                              <span className="text-neutral-400">{job.jobNumber}</span>
                              <span className="truncate text-neutral-200">{job.jobName} <span className="text-neutral-500">· {TYPE_LABEL[job.type]}</span></span>
                              <span className="text-right text-neutral-400">{cents(job.gpPerHour)}</span>
                              <span className="text-right text-neutral-300">{hours} h</span>
                              <span className="text-right text-white">{cents(part)}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {people.length === 0 && <tr><td colSpan={5} className="empty-row">No per-person hours yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </CollapsibleSection>
  )
}

export default function CompletedJobsTab({ completedJobs, onBack }) {
  const [sort, setSort] = useState({ key: 'gpPerHour', dir: -1 })
  const [typeFilter, setTypeFilter] = useLocalStorageState('completedJobs.typeFilter', 'all')
  // Owner and type of work are the same per-job stores the Projects dropdowns
  // write to, so a job set in either place shows the same value in both.
  const [owners, setOwners] = useState(null)
  const [categories, setCategories] = useState(null)
  const [saving, setSaving] = useState(() => new Set())
  const [saveError, setSaveError] = useState('')
  useEffect(() => {
    let live = true
    Promise.all([fetchJobOwners(), fetchJobCategories()])
      .then(([o, c]) => { if (live) { setOwners(o); setCategories(c) } })
      .catch(() => { if (live) { setOwners({}); setCategories({}); setSaveError('Could not load owners and types of work.') } })
    return () => { live = false }
  }, [])
  async function saveField(kind, job, value) {
    const [map, setMap, save, label] = kind === 'owner'
      ? [owners, setOwners, saveJobOwner, 'owner']
      : [categories, setCategories, saveJobCategory, 'type of work']
    const previous = map?.[job.jobNumber] ?? ''
    if (value === previous) return
    const token = `${kind}:${job.jobNumber}`
    setMap((m) => ({ ...m, [job.jobNumber]: value }))
    setSaving((prev) => new Set(prev).add(token))
    setSaveError('')
    const saved = await save(job.jobNumber, value)
    setSaving((prev) => { const next = new Set(prev); next.delete(token); return next })
    if (saved) setMap(saved)
    else {
      setMap((m) => ({ ...m, [job.jobNumber]: previous }))
      setSaveError(`Could not save the ${label} for job ${job.jobNumber}. Nothing was changed.`)
    }
  }
  const loaded = owners !== null && categories !== null
  const cells = (j) => ({
    category: <CategoryCell job={j} value={categories?.[j.jobNumber] ?? ''} saving={!loaded || saving.has(`category:${j.jobNumber}`)} onChange={(job, v) => saveField('category', job, v)} />,
    owner: <OwnerCell job={j} value={owners?.[j.jobNumber] ?? ''} saving={!loaded || saving.has(`owner:${j.jobNumber}`)} onChange={(job, v) => saveField('owner', job, v)} />,
  })
  const [open, setOpen] = useState(() => new Set())
  function toggleOpen(jobNumber) {
    setOpen((prev) => { const next = new Set(prev); next.has(jobNumber) ? next.delete(jobNumber) : next.add(jobNumber); return next })
  }

  function toggleSort(key) {
    setSort((prev) => (prev.key === key ? { key, dir: -prev.dir } : { key, dir: TEXT_SORTS.has(key) ? 1 : -1 }))
  }

  const byType = useMemo(() => ({
    chargeup: completedJobs.filter((j) => j.type === 'chargeup'),
    quoted: completedJobs.filter((j) => j.type === 'quoted'),
  }), [completedJobs])
  const shown = typeFilter === 'all' ? completedJobs : (byType[typeFilter] ?? completedJobs)

  const rows = useMemo(() => {
    return [...shown].sort((a, b) => {
      const av = sortValue(a)
      const bv = sortValue(b)
      // blanks (no owner, no type of work, …) always go last
      const blank = (v) => v === null || v === undefined || v === ''
      if (blank(av) || blank(bv)) return blank(av) - blank(bv)
      if (typeof av === 'string') return av.localeCompare(bv) * sort.dir
      return (av - bv) * sort.dir
    })
    function sortValue(j) {
      switch (sort.key) {
        case 'jobNumber': return Number(j.jobNumber)
        case 'type': return TYPE_LABEL[j.type] ?? j.type
        case 'hoursDiff': return hoursDiff(j)
        case 'workedBy': return contributors(j).worked[0]?.name ?? ''
        case 'category': return categories?.[j.jobNumber] ?? ''
        case 'owner': return owners?.[j.jobNumber] ?? ''
        default: return j[sort.key]
      }
    }
  }, [shown, sort, owners, categories])

  return (
    <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-6">
      <nav className="flex items-center gap-1.5 text-sm text-text-muted">
        <button className="transition-colors hover:text-text-primary" onClick={onBack}>
          Operations overview
        </button>
        <span aria-hidden="true">/</span>
        <span className="text-text-primary">Completed jobs</span>
      </nav>

      <div>
        <h1 className="text-2xl font-semibold text-white">Completed jobs — GP per hour</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Labour profit per hour for each finished job. Labour profit is quoted labour cost −
          actual labour cost for a quoted job, and actual labour sell − actual labour cost for
          a charge-up job — divided by the actual hours (charge-up: the Sold tab&apos;s labour
          hours). On a job with more than one person, each person&apos;s part is that GP/hr ×
          their hours. Quoted h is a quoted job&apos;s quoted hours, or a charge-up job&apos;s sold +
          unsold hours; difference h is quoted − actual. Click a job to see the working and who worked on it. Add a month&apos;s jobs in Update data → Completed jobs.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Job type">
          {TYPE_FILTERS.map((f) => {
            const n = f.key === 'all' ? completedJobs.length : byType[f.key].length
            const on = typeFilter === f.key
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setTypeFilter(f.key)}
                aria-pressed={on}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  on ? 'border-brand-green/50 bg-brand-green/10 text-brand-green' : 'border-white/10 text-neutral-400 hover:border-white/20 hover:text-white'
                }`}
              >
                {f.label} ({n})
              </button>
            )
          })}
        </div>
        <p className="flex items-center gap-2 text-[12px] text-neutral-500">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ background: TEAM_TINT, boxShadow: `inset 3px 0 0 ${TEAM}` }} aria-hidden="true" />
          Blue rows were worked on by more than one person — click one to see the split.
        </p>
        {saveError && <p className="text-sm text-red-400">{saveError}</p>}
        <div className="flex flex-col gap-3 sm:flex-row">
          {(typeFilter === 'all' ? ['chargeup', 'quoted'] : [typeFilter]).map((t) => (
            <TypeSummary key={t} type={t} jobs={byType[t] ?? []} active={typeFilter === t}
              onSelect={() => setTypeFilter(typeFilter === t ? 'all' : t)} />
          ))}
        </div>
      </div>

      <PeopleSummary jobs={shown} scope={typeFilter === 'all' ? 'all completed jobs' : `${TYPE_LABEL[typeFilter].toLowerCase()} jobs`} />

      <CollapsibleSection
        className="rounded-[18px] border border-white/[0.06] bg-[#11161c] p-6"
        storageKey="completed-jobs.table"
        title={`${rows.length} ${typeFilter === 'all' ? 'completed' : TYPE_LABEL[typeFilter].toLowerCase()} job${rows.length === 1 ? '' : 's'}`}
      >
        {/* Mobile: no column headers to click, so a sort picker instead. */}
        <div className="mt-4 flex items-center gap-2 sm:hidden">
          <label htmlFor="completed-sort" className="text-[12px] text-neutral-500">Sort by</label>
          <select
            id="completed-sort"
            value={sort.key}
            onChange={(e) => setSort({ key: e.target.value, dir: TEXT_SORTS.has(e.target.value) ? 1 : -1 })}
            className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[13px] text-white"
          >
            {COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <button
            type="button"
            onClick={() => setSort((prev) => ({ ...prev, dir: -prev.dir }))}
            className="rounded-lg border border-white/10 px-2 py-1 text-[13px] text-neutral-300"
            aria-label={sort.dir === 1 ? 'Ascending — switch to descending' : 'Descending — switch to ascending'}
          >
            {sort.dir === 1 ? '▲' : '▼'}
          </button>
        </div>
        {/* Mobile: one stacked card per job. */}
        <div className="mt-4 flex flex-col gap-3 sm:hidden">
          {rows.map((j) => (
            <div
              key={j.jobNumber}
              role="button"
              tabIndex={0}
              aria-expanded={open.has(j.jobNumber)}
              onClick={() => toggleOpen(j.jobNumber)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleOpen(j.jobNumber) } }}
              className="flex cursor-pointer flex-col gap-3 rounded-[14px] border border-white/[0.06] bg-white/[0.02] p-4"
              style={isTeam(j) ? { background: TEAM_TINT, boxShadow: `inset 3px 0 0 ${TEAM}` } : undefined}
            >
              <div>
                <p className="text-[14px] font-medium text-white">
                  <span className="text-neutral-400">{j.jobNumber}</span> {j.jobName}
                </p>
                <p className="mt-0.5 text-[12px] text-neutral-500">{TYPE_LABEL[j.type] ?? j.type}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {cells(j).category}
                {cells(j).owner}
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
                <span className="text-neutral-400">Labour profit</span>
                <span className="text-right tabular-nums text-neutral-200">{money(j.profit)}</span>
                <span className="text-neutral-400">Actual h</span>
                <span className="text-right tabular-nums text-neutral-200">{j.hours}</span>
                <span className="text-neutral-400">Quoted h</span>
                <span className="text-right tabular-nums text-neutral-200">{j.quotedHours ?? '—'}</span>
                <span className="text-neutral-400">Difference h</span>
                <span className="text-right tabular-nums"><DiffHours job={j} /></span>
                <span className="text-neutral-400">GP $/hr</span>
                <span className="text-right tabular-nums font-medium text-white">{cents(j.gpPerHour)}</span>
              </div>
              <p className="text-[12px] text-neutral-500">
                <WorkedBy job={j} /> · {open.has(j.jobNumber) ? 'Hide' : 'Show'} who worked on it
              </p>
              {open.has(j.jobNumber) && <div className="border-t border-white/10 pt-3"><Breakdown job={j} /></div>}
            </div>
          ))}
          {rows.length === 0 && <p className="empty-row">No completed jobs added yet.</p>}
        </div>

        <div className="table-scroll hidden sm:block">
          <table className="data-table">
            <thead>
              <tr>
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className={`${col.num ? 'num ' : ''}sortable`}
                    onClick={() => toggleSort(col.key)}
                    aria-sort={sort.key === col.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
                  >
                    {col.label}
                    {sort.key === col.key && (sort.dir === 1 ? ' ▲' : ' ▼')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((j) => {
                const isOpen = open.has(j.jobNumber)
                return (
                  <Fragment key={j.jobNumber}>
                    <tr
                      className="cursor-pointer"
                      style={isTeam(j) ? { background: TEAM_TINT } : undefined}
                      tabIndex={0}
                      aria-expanded={isOpen}
                      onClick={() => toggleOpen(j.jobNumber)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleOpen(j.jobNumber) } }}
                    >
                      <td style={isTeam(j) ? { boxShadow: `inset 3px 0 0 ${TEAM}` } : undefined}>
                        <span className={`mr-2 inline-block text-neutral-500 transition-transform ${isOpen ? 'rotate-90' : ''}`} aria-hidden="true">›</span>
                        {j.jobNumber}
                      </td>
                      <td>{j.jobName}</td>
                      <td>{TYPE_LABEL[j.type] ?? j.type}</td>
                      <td className="num font-medium">{cents(j.gpPerHour)}</td>
                      <td className="num">{money(j.profit)}</td>
                      <td className="num">{j.hours}</td>
                      <td className="num">{j.quotedHours ?? '—'}</td>
                      <td className="num"><DiffHours job={j} /></td>
                      <td><WorkedBy job={j} /></td>
                      <td>{cells(j).category}</td>
                      <td>{cells(j).owner}</td>
                      <td className="num">{j.addedAt}</td>
                    </tr>
                    {isOpen && (
                      <tr style={isTeam(j) ? { background: TEAM_TINT } : undefined}>
                        <td colSpan={12} className="bg-white/[0.02]" style={isTeam(j) ? { boxShadow: `inset 3px 0 0 ${TEAM}` } : undefined}>
                          <div className="max-w-3xl py-2 pl-6"><Breakdown job={j} /></div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="empty-row">
                    No completed jobs added yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CollapsibleSection>
    </div>
  )
}
