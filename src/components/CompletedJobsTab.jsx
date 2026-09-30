import { Fragment, useEffect, useMemo, useState } from 'react'
import { Users } from 'lucide-react'
import { cents, money, percent } from '../lib/format'
import CollapsibleSection from './CollapsibleSection'
import LastSynced from './LastSynced'
import CompletedCompare from './CompletedCompare'
import { useLocalStorageState } from '../lib/useLocalStorageState'
import { fetchJobOwners, saveJobOwner } from '../lib/jobOwnerStore'
import { fetchJobCategories, saveJobCategory } from '../lib/jobCategoryStore'
import { OwnerCell, CategoryCell } from './JobTable'
import { JOB_CATEGORIES } from '../lib/jobCategories'
import { contributors, projectGpPerHour, projectProfit } from '../lib/completedJobPeople'
import { jobsToReview, overruns } from '../lib/completedJobReview'

// Loaded by scripts/lib/completed-job.mjs — labour only: a quoted job's profit is
// its Labour Quoted Cost − Labour Actual Cost, a charge-up job's is Labour Actual
// Sell − Labour Actual Cost, each over the job's actual hours. Sorted by GP/hour by default: the whole point of this tab
// is spotting which finished jobs actually paid well per hour worked,
// which a plain "most profitable" or "most recent" sort wouldn't surface —
// a small quick job can easily out-earn a big one per hour.
// Every column sorts; text columns start A–Z, numbers high to low. `group` puts a
// column under a two-row header; the groups can be shown or hidden from Columns.
const TEXT_SORTS = new Set(['jobName', 'type', 'workedBy', 'category', 'owner'])
const pct = (v) => (v == null ? '—' : percent(v))
const COLUMNS = [
  { key: 'jobNumber', label: 'Job #', get: (j) => Number(j.jobNumber), sticky: 0 },
  { key: 'jobName', label: 'Job name', sticky: 1 },
  { key: 'type', label: 'Type', get: (j) => TYPE_LABEL[j.type] ?? j.type },
  { key: 'gpPerHour', group: 'gp', label: 'GP/hr', num: true, get: projectGpPerHour, fmt: cents, strong: true },
  { key: 'quotedHours', group: 'gp', label: 'Quoted h', num: true },
  { key: 'hours', group: 'gp', label: 'Actual h', num: true },
  { key: 'hoursDiff', group: 'gp', label: 'Diff h', num: true, get: (j) => hoursDiff(j) },
  { key: 'quotedProfit', group: 'margin', label: 'Quoted profit', num: true, get: (j) => j.pl?.quotedProfit, fmt: money },
  { key: 'quotedMargin', group: 'margin', label: 'Quoted margin', num: true, get: (j) => j.pl?.quotedMargin, fmt: pct },
  { key: 'profitToDate', group: 'margin', label: 'Profit to date', num: true, get: (j) => j.pl?.profitToDate, fmt: money },
  { key: 'marginToDate', group: 'margin', label: 'Margin to date', num: true, get: (j) => j.pl?.marginToDate, fmt: pct },
  { key: 'labourQuoted', group: 'labour', label: 'Quoted $', num: true, get: (j) => j.labour?.quotedCost, fmt: money },
  { key: 'labourActual', group: 'labour', label: 'Actual $', num: true, get: (j) => j.labour?.actualCost, fmt: money },
  { key: 'costQuoted', group: 'cost', label: 'Quoted', num: true, get: (j) => j.pl?.quotedCost, fmt: money },
  { key: 'costActual', group: 'cost', label: 'Actual', num: true, get: (j) => j.pl?.actualCost, fmt: money },
  { key: 'workedBy', group: 'people', label: 'Worked by' },
  { key: 'category', group: 'people', label: 'Type of work' },
  { key: 'owner', group: 'people', label: 'Owner' },
  { key: 'addedAt', group: 'people', label: 'Date added', num: true },
]
const GROUPS = [
  { key: 'gp', label: 'GP $/hr' },
  { key: 'margin', label: 'GP $ / %' },
  { key: 'labour', label: 'Labour cost' },
  { key: 'cost', label: 'Total cost' },
  { key: 'people', label: 'Worked by, type of work, owner', flat: true },
]
// Which cells turn red when a quoted job came in over quote on that measure.
const OVER_CELLS = { hours: ['hours', 'hoursDiff'], labour: ['labourActual'], cost: ['costActual'] }
const OVER = 'var(--viz-critical)'
const OVER_TINT = 'color-mix(in srgb, var(--viz-critical) 12%, transparent)'
const fmtOver = (o) => (o.unit === 'h' ? `${o.label} ${o.quoted} → ${o.actual} h` : `${o.label} ${money(o.quoted)} → ${money(o.actual)}`)

// Frozen leading columns (Job #, Job name) — widths so the second knows its left.
const STICKY_W = [98, 186]
const STICKY_LEFT = [0, STICKY_W[0]]

// Difference = quoted − actual hours. A charge-up job's quoted hours are Sold +
// Unsold and its actual hours are Sold, so its difference is its Unsold hours.
const hoursDiff = (j) => (j.quotedHours == null ? null : Math.round((j.quotedHours - j.hours) * 100) / 100)
function DiffHours({ job }) {
  const d = hoursDiff(job)
  if (d === null) return <span className="text-neutral-500">—</span>
  return <span className={d > 0 ? 'text-brand-green' : d < 0 ? 'text-red-400' : 'text-neutral-400'}>{d > 0 ? '+' : ''}{d}</span>
}

const TYPE_LABEL = { quoted: 'Quoted', chargeup: 'Charge-up' }

// Jobs worked by more than one person just get a "N people" tag; the row colour
// is kept for quoted jobs that came in over quote (red), so they stand out.
const TEAM = 'var(--viz-1)'

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

// How the job's project GP/hr was worked out: its profit to date (P&L) over its
// actual hours. (The labour-only rate stays behind the scenes, splitting a job
// between its people.)
function LabourSum({ job }) {
  const profit = projectProfit(job)
  if (!(job.hours > 0) || profit == null) {
    return <p className="text-[12px] text-neutral-400">No sold (actual) hours, so no GP/hr{job.unsoldHours ? ` (${job.unsoldHours} h unsold)` : ''}.</p>
  }
  return (
    <p className="text-[12px] tabular-nums text-neutral-400">
      <span className="text-neutral-200">{cents(profit)}</span> profit to date (P&amp;L) ÷ {job.hours} actual h = <span className="font-medium text-white">{cents(projectGpPerHour(job))}/hr</span>
    </p>
  )
}

function Breakdown({ job }) {
  const { worked: people, adjustments } = contributors(job)
  // Only quoted jobs split GP per person; a charge-up job just lists who worked it.
  const split = job.type === 'quoted' && people.length > 1
  if (!people.length) {
    return <div className="flex flex-col gap-2.5"><LabourSum job={job} /><p className="text-[13px] text-neutral-500">{job.type === 'chargeup' ? 'No sold hours on this job, so there are no per-person hours to show.' : 'No per-person hours for this job — its timesheet export wasn\u2019t included.'}</p></div>
  }
  return (
    <div className="flex flex-col gap-2.5">
      <LabourSum job={job} />
      <p className="text-[12px] text-neutral-500">
        {people.length === 1
          ? 'One person did all the hours on this job.'
          : split
            ? `${people.length} people worked on this job — their part of the job's labour profit is split by their hours.`
            : `${people.length} people worked on this job.`}
      </p>
      {people.length > 1 && (
        <div className={`${split ? GRID : GRID_ONE} text-[11px] uppercase tracking-wide text-neutral-500`}>
          <span>Person</span>
          <span />
          <span className="text-right">Hours</span>
          <span className="text-right">Share</span>
          {split && <span className="text-right">Their part</span>}
        </div>
      )}
      {people.map((p, i) => (
        <div key={p.name} className={`${split ? GRID : GRID_ONE} items-center text-[13px]`}>
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
          {split && <span className="text-right tabular-nums font-medium text-white">{cents(p.gpTimesHours)}</span>}
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

// Jobs with no actual hours (flagged 'no-sold-hours') have no GP/hr, so they're
// left out of the rate — their profit over zero hours would only inflate it.
function typeStats(all) {
  const jobs = all.filter((j) => projectGpPerHour(j) !== null)
  const profit = jobs.reduce((sum, j) => sum + projectProfit(j), 0)
  const hours = jobs.reduce((sum, j) => sum + (j.hours ?? 0), 0)
  return { count: all.length, profit, hours: Math.round(hours * 100) / 100, gp: hours ? profit / hours : null }
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
        {money(st.profit)} profit to date ÷ {st.hours} actual h
      </span>
    </button>
  )
}

const NOT_SET = 'Not set'

// Data to check, set when the job was loaded — shown as a tooltip on the type:
// no name in Katipolt (named by its number), or no sold hours (so no GP/hr).
const CHECK_NOTE = { 'no-name': 'No name in Katipolt — add one there and re-upload.', 'no-sold-hours': 'No sold hours, so no GP/hr.' }
const checkNote = (job) => (job.flags ?? []).map((f) => CHECK_NOTE[f] ?? f).join(' ') || undefined

// Totals for the ticked jobs, per column. Sums for money and hours; GP/hr and the
// margins are worked out from the sums (total profit ÷ total hours, profit ÷
// sell), never averaged — so a big job counts for more than a small one.
function selectionTotals(jobs) {
  const sum = (get) => {
    const vals = jobs.map(get).filter((v) => v != null)
    return vals.length ? vals.reduce((t, v) => t + v, 0) : null
  }
  const withHours = jobs.filter((j) => j.hours > 0)
  const gpH = withHours.reduce((t, j) => t + j.hours, 0)
  const withQuote = jobs.filter((j) => j.quotedHours != null)
  const margin = (profitKey, costKey) => {
    const both = jobs.filter((j) => j.pl?.[profitKey] != null && j.pl?.[costKey] != null)
    const p = both.reduce((t, j) => t + j.pl[profitKey], 0), c = both.reduce((t, j) => t + j.pl[costKey], 0)
    return both.length && p + c ? p / (p + c) : null
  }
  const cu = jobs.filter((j) => j.type === 'chargeup').length
  return {
    jobNumber: 'Total',
    jobName: `${jobs.length} job${jobs.length === 1 ? '' : 's'} selected`,
    type: [cu && `${cu} charge-up`, jobs.length - cu && `${jobs.length - cu} quoted`].filter(Boolean).join(' · '),
    gpPerHour: gpH ? withHours.reduce((t, j) => t + (projectProfit(j) ?? 0), 0) / gpH : null,
    quotedHours: sum((j) => j.quotedHours),
    hours: sum((j) => j.hours),
    hoursDiff: withQuote.length ? withQuote.reduce((t, j) => t + j.quotedHours - j.hours, 0) : null,
    quotedProfit: sum((j) => j.pl?.quotedProfit),
    quotedMargin: margin('quotedProfit', 'quotedCost'),
    profitToDate: sum((j) => j.pl?.profitToDate),
    marginToDate: margin('profitToDate', 'actualCost'),
    labourQuoted: sum((j) => j.labour?.quotedCost),
    labourActual: sum((j) => j.labour?.actualCost),
    labourQuotedH: sum((j) => j.quotedHours),
    labourActualH: sum((j) => j.hours),
    costQuoted: sum((j) => j.pl?.quotedCost),
    costActual: sum((j) => j.pl?.actualCost),
  }
}
const round2 = (v) => Math.round(v * 100) / 100

function HeadCell({ col, rowSpan, sub, sort, onSort, children }) {
  const on = sort.key === col.key
  const sticky = col.sticky !== undefined
  return (
    <th
      rowSpan={rowSpan}
      className={[col.num && 'num', 'sortable', sub && 'th-sub', sticky && 'sticky-col', col.sticky === 1 && 'sticky-col-end'].filter(Boolean).join(' ')}
      style={sticky ? { left: STICKY_LEFT[col.sticky], minWidth: STICKY_W[col.sticky], maxWidth: STICKY_W[col.sticky] } : undefined}
      onClick={() => onSort(col.key)}
      aria-sort={on ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
    >
      {children}
      {col.label}
      {on && (sort.dir === 1 ? ' ▲' : ' ▼')}
    </th>
  )
}

export default function CompletedJobsTab({ completedJobs, onBack, focusJob }) {
  const [sort, setSort] = useState({ key: 'gpPerHour', dir: -1 })
  const [typeFilter, setTypeFilter] = useLocalStorageState('completedJobs.typeFilter', 'all')
  const [workFilter, setWorkFilter] = useState(null)   // a type of work picked in the counts table
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
  // Column groups the viewer has hidden (saved in this browser).
  const [hiddenGroups, setHiddenGroups] = useLocalStorageState('completedJobs.hiddenGroups.v2', ['people'])
  const [pickerOpen, setPickerOpen] = useState(false)
  // Ticked jobs: a Total row sums them, and "Show selected only" filters to them.
  const [selected, setSelected] = useState(() => new Set())
  const [selectedOnly, setSelectedOnly] = useState(false)
  const toggleSelected = (n) => setSelected((prev) => { const next = new Set(prev); next.has(n) ? next.delete(n) : next.add(n); return next })
  const hidden = new Set(hiddenGroups)
  const visibleCols = COLUMNS.filter((c) => !c.group || !hidden.has(c.group))
  const toggleGroup = (key) => setHiddenGroups(hidden.has(key) ? hiddenGroups.filter((g) => g !== key) : [...hiddenGroups, key])
  // Header row 1: ungrouped columns span both rows; each visible group spans its columns.
  const headRow1 = []
  for (const c of visibleCols) {
    const g = c.group && GROUPS.find((x) => x.key === c.group)
    if (!g || g.flat) headRow1.push({ col: c })
    else if (headRow1.at(-1)?.group !== g) headRow1.push({ group: g, span: 1 })
    else headRow1.at(-1).span += 1
  }
  const subCols = visibleCols.filter((c) => c.group && !GROUPS.find((x) => x.key === c.group)?.flat)

  const toReview = useMemo(() => jobsToReview(completedJobs), [completedJobs])
  const [open, setOpen] = useState(() => new Set(focusJob ? [focusJob.job] : []))
  // Opened from the notifications bell: show that job's row, expanded, in view.
  function reviewJob(jobNumber) {
    setTypeFilter('all')
    setWorkFilter(null)
    setOpen((prev) => new Set(prev).add(jobNumber))
    // The row may not be laid out yet (tab just opened, filters just reset), so
    // wait for it before scrolling it into the middle of the screen.
    let tries = 0
    const scroll = () => {
      const el = document.getElementById(`cj-${jobNumber}`)
      if (el && el.offsetParent) el.scrollIntoView({ block: 'center' })
      else if (tries++ < 20) setTimeout(scroll, 100)
    }
    setTimeout(scroll, 150)
  }
  useEffect(() => {
    if (!focusJob) return
    const t = setTimeout(() => reviewJob(focusJob.job), 0)
    return () => clearTimeout(t)
  }, [focusJob]) // eslint-disable-line react-hooks/exhaustive-deps
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
  const byTypeShown = typeFilter === 'all' ? completedJobs : (byType[typeFilter] ?? completedJobs)
  const shown = useMemo(() => (workFilter
    ? byTypeShown.filter((j) => (categories?.[j.jobNumber] || NOT_SET) === workFilter)
    : byTypeShown), [byTypeShown, workFilter, categories])

  const rows = useMemo(() => {
    const pool = selectedOnly ? shown.filter((j) => selected.has(j.jobNumber)) : shown
    return [...pool].sort((a, b) => {
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
        case 'workedBy': return contributors(j).worked[0]?.name ?? ''
        case 'category': return categories?.[j.jobNumber] ?? ''
        case 'owner': return owners?.[j.jobNumber] ?? ''
        default: {
          const col = COLUMNS.find((c) => c.key === sort.key)
          return col?.get ? col.get(j) : j[sort.key]
        }
      }
    }
  }, [shown, sort, owners, categories, selectedOnly, selected])
  const selectedJobs = completedJobs.filter((j) => selected.has(j.jobNumber))
  const totals = selectedJobs.length ? selectionTotals(selectedJobs) : null
  const allShownTicked = rows.length > 0 && rows.every((j) => selected.has(j.jobNumber))

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
        <div className="mt-1"><LastSynced kind="completed" /></div>
        <p className="mt-1 text-sm text-neutral-400">
          Project GP per hour for each finished job: its profit to date (the P&amp;L&apos;s actual
          profit) ÷ actual hours — for a charge-up job, the Sold tab&apos;s labour hours. Quoted h
          is a quoted job&apos;s quoted hours, or a charge-up job&apos;s sold + unsold hours; difference h
          is quoted − actual. Click a job to see the working and who worked on it. Add a month&apos;s jobs in Update data → Completed jobs.
        </p>
      </div>

      {toReview.length > 0 && (
        <div className="rounded-[14px] border p-4" style={{ borderColor: `color-mix(in srgb, ${OVER} 45%, transparent)`, background: `color-mix(in srgb, ${OVER} 7%, transparent)` }}>
          <p className="text-[14px] font-medium" style={{ color: OVER }}>
            {toReview.length} quoted job{toReview.length === 1 ? '' : 's'} came in over quote — please review
          </p>
          <ul className="mt-2 flex flex-col gap-1 text-[13px]">
            {toReview.map(({ job, over }) => (
              <li key={job.jobNumber}>
                <button type="button" onClick={() => reviewJob(job.jobNumber)} className="text-left hover:underline">
                  <span className="font-medium text-white">{job.jobNumber}</span>{' '}
                  <span className="text-neutral-300">{job.jobName}</span>
                  <span className="text-neutral-400"> — {over.map(fmtOver).join(' · ')}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <p className="flex items-center gap-2 text-[12px] text-neutral-500">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ background: OVER_TINT, boxShadow: `inset 4px 0 0 ${OVER}` }} aria-hidden="true" />
          Red rows are quoted jobs that came in over quote — the blinking figures are what went over.
        </p>
        {saveError && <p className="text-sm text-red-400">{saveError}</p>}
        <div className="flex flex-col gap-3 sm:flex-row">
          {(typeFilter === 'all' ? ['chargeup', 'quoted'] : [typeFilter]).map((t) => (
            <TypeSummary key={t} type={t} jobs={byType[t] ?? []} active={typeFilter === t}
              onSelect={() => setTypeFilter(typeFilter === t ? 'all' : t)} />
          ))}
        </div>
      </div>


      <CollapsibleSection
        className="rounded-[18px] border border-white/[0.06] bg-[#11161c] p-6"
        storageKey="completed-jobs.table"
        title={`${rows.length} ${typeFilter === 'all' ? 'completed' : TYPE_LABEL[typeFilter].toLowerCase()} job${rows.length === 1 ? '' : 's'}${workFilter ? ` · ${workFilter}` : ''}`}
      >
        {/* Filters right above the table: job type, then type of work. Counts in
            each button are for what the other filter currently leaves. */}
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Job type">
            <span className="mr-1 w-24 text-[12px] text-neutral-500">Job type</span>
            {TYPE_FILTERS.map((f) => {
              const pool = workFilter ? completedJobs.filter((j) => (categories?.[j.jobNumber] || NOT_SET) === workFilter) : completedJobs
              const n = f.key === 'all' ? pool.length : pool.filter((j) => j.type === f.key).length
              const on = typeFilter === f.key
              return (
                <button key={f.key} type="button" onClick={() => setTypeFilter(f.key)} aria-pressed={on}
                  className={`rounded-full border px-3 py-1 text-[13px] font-medium transition-colors ${
                    on ? 'border-brand-green/50 bg-brand-green/10 text-brand-green' : 'border-white/10 text-neutral-400 hover:border-white/20 hover:text-white'
                  }`}>
                  {f.label} ({n})
                </button>
              )
            })}
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Type of work">
            <span className="mr-1 w-24 text-[12px] text-neutral-500">Type of work</span>
            {[null, ...JOB_CATEGORIES, NOT_SET].map((c) => {
              const pool = typeFilter === 'all' ? completedJobs : completedJobs.filter((j) => j.type === typeFilter)
              const n = c === null ? pool.length : pool.filter((j) => (categories?.[j.jobNumber] || NOT_SET) === c).length
              if (c !== null && !completedJobs.some((j) => (categories?.[j.jobNumber] || NOT_SET) === c)) return null
              const on = workFilter === c
              return (
                <button key={c ?? 'all'} type="button" onClick={() => setWorkFilter(c)} aria-pressed={on} disabled={!n && !on}
                  className={`rounded-full border px-3 py-1 text-[13px] font-medium transition-colors disabled:opacity-35 ${
                    on ? 'border-brand-green/50 bg-brand-green/10 text-brand-green' : 'border-white/10 text-neutral-400 hover:border-white/20 hover:text-white'
                  }`}>
                  {c ?? 'All'} ({n})
                </button>
              )
            })}
          </div>
        </div>

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
              style={overruns(j).length ? { background: OVER_TINT, boxShadow: `inset 4px 0 0 ${OVER}` } : undefined}
            >
              <div>
                <p className="text-[14px] font-medium text-white">
                  <span className="text-neutral-400">{j.jobNumber}</span> {j.jobName}
                </p>
                <p className="mt-0.5 text-[12px] text-neutral-500" title={checkNote(j)}>{TYPE_LABEL[j.type] ?? j.type}</p>
                {overruns(j).length > 0 && (
                  <p className="mt-1 text-[12px] font-medium" style={{ color: OVER }}>Over quote — review: {overruns(j).map(fmtOver).join(' · ')}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {cells(j).category}
                {cells(j).owner}
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
                <span className="text-neutral-400">Quoted profit · margin</span>
                <span className="text-right tabular-nums text-neutral-200">{j.pl?.quotedProfit == null ? '—' : `${money(j.pl.quotedProfit)} · ${pct(j.pl.quotedMargin)}`}</span>
                <span className="text-neutral-400">Profit · margin to date</span>
                <span className="text-right tabular-nums text-neutral-200">{j.pl?.profitToDate == null ? '—' : `${money(j.pl.profitToDate)} · ${pct(j.pl.marginToDate)}`}</span>
                <span className="text-neutral-400">Labour cost (quoted · actual)</span>
                <span className="text-right tabular-nums text-neutral-200">{j.labour?.quotedCost == null ? '—' : money(j.labour.quotedCost)} · {j.labour?.actualCost == null ? '—' : money(j.labour.actualCost)}</span>
                <span className="text-neutral-400">Total cost (quoted · actual)</span>
                <span className="text-right tabular-nums text-neutral-200">{j.pl?.quotedCost == null ? '—' : money(j.pl.quotedCost)} · {j.pl?.actualCost == null ? '—' : money(j.pl.actualCost)}</span>
                <span className="text-neutral-400">Actual h</span>
                <span className="text-right tabular-nums text-neutral-200">{j.hours}</span>
                <span className="text-neutral-400">Quoted h</span>
                <span className="text-right tabular-nums text-neutral-200">{j.quotedHours ?? '—'}</span>
                <span className="text-neutral-400">Difference h</span>
                <span className="text-right tabular-nums"><DiffHours job={j} /></span>
                <span className="text-neutral-400">GP $/hr</span>
                <span className="text-right tabular-nums font-medium text-white">{cents(projectGpPerHour(j))}</span>
              </div>
              <p className="text-[12px] text-neutral-500">
                <WorkedBy job={j} /> · {open.has(j.jobNumber) ? 'Hide' : 'Show'} who worked on it
              </p>
              {open.has(j.jobNumber) && <div className="border-t border-white/10 pt-3"><Breakdown job={j} /></div>}
            </div>
          ))}
          {rows.length === 0 && <p className="empty-row">No completed jobs added yet.</p>}
        </div>

        <div className="relative mt-3 hidden items-center gap-2 sm:flex">
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            aria-expanded={pickerOpen}
            className="rounded-full border border-white/10 px-3 py-1 text-[12px] font-medium text-neutral-300 hover:border-white/20 hover:text-white"
          >
            Columns{hiddenGroups.length ? ` · ${hiddenGroups.length} hidden` : ''} ▾
          </button>
          {pickerOpen && (
            <div className="absolute left-0 top-full z-20 mt-1 flex w-72 flex-col gap-1 rounded-xl border border-white/10 bg-[#11161c] p-3 shadow-xl">
              <p className="mb-1 text-[11px] uppercase tracking-wide text-neutral-500">Show columns</p>
              {GROUPS.map((g) => (
                <label key={g.key} className="flex cursor-pointer items-center gap-2 text-[13px] text-neutral-200">
                  <input type="checkbox" checked={!hidden.has(g.key)} onChange={() => toggleGroup(g.key)} />
                  {g.label}
                </label>
              ))}
              <p className="mt-1 text-[11px] text-neutral-500">Job #, job name and type always show.</p>
            </div>
          )}
          {selected.size > 0 ? (
            <>
              <span className="text-[12px] font-medium text-brand-green">{selected.size} selected</span>
              <button type="button" onClick={() => setSelectedOnly((v) => !v)} aria-pressed={selectedOnly}
                className={`rounded-full border px-3 py-1 text-[12px] font-medium transition-colors ${
                  selectedOnly ? 'border-brand-green/50 bg-brand-green/10 text-brand-green' : 'border-white/10 text-neutral-300 hover:border-white/20 hover:text-white'
                }`}>
                Show selected only
              </button>
              <button type="button" onClick={() => document.getElementById('completed-compare')?.scrollIntoView({ block: 'start', behavior: 'smooth' })}
                className="rounded-full border border-brand-green/50 bg-brand-green/10 px-3 py-1 text-[12px] font-medium text-brand-green hover:bg-brand-green/15">
                Compare &amp; AI summary ↓
              </button>
              <button type="button" onClick={() => { setSelected(new Set()); setSelectedOnly(false) }}
                className="rounded-full border border-white/10 px-3 py-1 text-[12px] font-medium text-neutral-300 hover:border-white/20 hover:text-white">
                Clear
              </button>
            </>
          ) : (
            <span className="text-[12px] text-neutral-500">Tick jobs to add them up. Scroll inside the table — the header and job columns stay put.</span>
          )}
        </div>

        <div className="table-scroll table-freeze mt-2 hidden sm:block">
          <table className="data-table data-table--compact">
            <thead>
              <tr>
                {headRow1.map((h) => {
                  if (h.group) return <th key={h.group.key} colSpan={h.span} className="th-group">{h.group.label}</th>
                  const col = h.col
                  return (
                    <HeadCell key={col.key} col={col} rowSpan={subCols.length ? 2 : 1} sort={sort} onSort={toggleSort}>
                      {col.key === 'jobNumber' && (
                        <input type="checkbox" className="mr-2 align-[-2px]" aria-label="Select every job shown"
                          checked={allShownTicked}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => setSelected((prev) => {
                            const next = new Set(prev)
                            for (const j of rows) allShownTicked ? next.delete(j.jobNumber) : next.add(j.jobNumber)
                            return next
                          })} />
                      )}
                    </HeadCell>
                  )
                })}
              </tr>
              {subCols.length > 0 && (
                <tr>
                  {subCols.map((col) => <HeadCell key={col.key} col={col} sub sort={sort} onSort={toggleSort} />)}
                </tr>
              )}
            </thead>
            <tbody>
              {rows.map((j) => {
                const isOpen = open.has(j.jobNumber)
                const over = overruns(j)
                const redCells = new Set(over.flatMap((o) => OVER_CELLS[o.key]))
                const edge = over.length ? OVER : null
                return (
                  <Fragment key={j.jobNumber}>
                    <tr
                      id={`cj-${j.jobNumber}`}
                      title={over.length ? `Over quote — review: ${over.map(fmtOver).join(' · ')}` : undefined}
                      className={`cursor-pointer ${edge ? 'is-over' : ''} ${selected.has(j.jobNumber) ? 'is-selected' : ''}`}
                      style={edge ? { background: OVER_TINT } : undefined}
                      tabIndex={0}
                      aria-expanded={isOpen}
                      onClick={() => toggleOpen(j.jobNumber)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleOpen(j.jobNumber) } }}
                    >
                      {visibleCols.map((col) => {
                        const cls = [col.num && 'num', col.strong && 'font-medium', col.sticky !== undefined && 'sticky-col', col.sticky === 1 && 'sticky-col-end'].filter(Boolean).join(' ')
                        const style = col.sticky !== undefined ? { left: STICKY_LEFT[col.sticky], minWidth: STICKY_W[col.sticky], maxWidth: STICKY_W[col.sticky] } : undefined
                        let content
                        switch (col.key) {
                          case 'jobNumber':
                            content = (
                              <>
                                <input type="checkbox" className="mr-2 align-[-2px]" aria-label={`Select job ${j.jobNumber}`}
                                  checked={selected.has(j.jobNumber)}
                                  onClick={(e) => e.stopPropagation()}
                                  onKeyDown={(e) => e.stopPropagation()}
                                  onChange={() => toggleSelected(j.jobNumber)} />
                                <span className={`mr-1.5 inline-block text-neutral-500 transition-transform ${isOpen ? 'rotate-90' : ''}`} aria-hidden="true">›</span>{j.jobNumber}
                              </>
                            )
                            break
                          case 'jobName': content = <span className="block truncate" title={j.jobName}>{j.jobName}</span>; break
                          case 'hoursDiff': content = <DiffHours job={j} />; break
                          case 'type':
                            // Kept tight: the red row already marks a job to review; the
                            // no-name / no-sold-hours notes live in the tooltip.
                            content = <span title={checkNote(j)}>{TYPE_LABEL[j.type] ?? j.type}</span>
                            break
                          case 'workedBy': content = <WorkedBy job={j} />; break
                          case 'category': content = cells(j).category; break
                          case 'owner': content = cells(j).owner; break
                          default: {
                            const v = col.get ? col.get(j) : j[col.key]
                            content = v == null ? <span className="text-neutral-500">—</span> : col.fmt ? col.fmt(v) : v
                          }
                        }
                        return (
                          <td key={col.key} className={cls}
                            style={{
                              ...style,
                              ...(col.key === 'jobNumber' && edge ? { boxShadow: `inset 4px 0 0 ${edge}` } : {}),
                              ...(redCells.has(col.key) ? { color: OVER, fontWeight: 700 } : {}),
                            }}>
                            {redCells.has(col.key) ? <span className="blink-over">{content}</span> : content}
                          </td>
                        )
                      })}
                    </tr>
                    {isOpen && (
                      <tr className={edge ? 'is-over' : ''} style={edge ? { background: OVER_TINT } : undefined}>
                        <td colSpan={visibleCols.length} className="bg-white/[0.02]" style={edge ? { boxShadow: `inset 4px 0 0 ${edge}` } : undefined}>
                          {/* sticky so the breakdown stays in view when the table is scrolled sideways */}
                          <div className="sticky left-0 max-w-3xl py-2 pl-6"><Breakdown job={j} /></div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={visibleCols.length} className="empty-row">
                    No completed jobs added yet.
                  </td>
                </tr>
              )}
            </tbody>
            {totals && (
              <tfoot>
                <tr className="totals-row">
                  {visibleCols.map((col) => {
                    const v = totals[col.key]
                    const sticky = col.sticky !== undefined
                    const cls = [col.num && 'num', sticky && 'sticky-col', col.sticky === 1 && 'sticky-col-end'].filter(Boolean).join(' ')
                    const style = sticky ? { left: STICKY_LEFT[col.sticky], minWidth: STICKY_W[col.sticky], maxWidth: STICKY_W[col.sticky] } : undefined
                    let content = v == null || v === '' ? '' : typeof v === 'string' ? v : col.fmt ? col.fmt(v) : round2(v)
                    if (col.key === 'hoursDiff' && v != null) content = `${v > 0 ? '+' : ''}${round2(v)}`
                    if (col.key === 'gpPerHour' && v != null) content = `${cents(v)}/hr`
                    return <td key={col.key} className={cls} style={style}>{content}</td>
                  })}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {selectedJobs.length > 0 && <CompletedCompare jobs={selectedJobs} />}
      </CollapsibleSection>
    </div>
  )
}
