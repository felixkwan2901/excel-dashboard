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
import { contributors, monthName, projectGpPerHour, projectProfit } from '../lib/completedJobPeople'
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
  { key: 'hoursDiff', group: 'gp', label: 'Diff h', num: true, get: (j) => hoursDiff(j) },   // label/tooltip vary by job type: DIFF_LABEL
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
// "Diff h" = quoted − actual, but it means a different thing per job type: hours
// under quote for a quoted job, unsold hours for a charge-up job. The header and
// each cell's tooltip say which.
const DIFF_LABEL = { all: 'Diff h', quoted: 'Under quote h', chargeup: 'Unsold h' }
const DIFF_TITLE = {
  all: 'Quoted h − actual h. Quoted job: hours under quote (minus = over quote). Charge-up job: hours booked but not sold.',
  quoted: 'Quoted h − actual h: hours under quote (minus = over quote).',
  chargeup: 'Hours booked but not sold (quoted h = sold + unsold).',
}
const colLabel = (col, typeFilter) => (col.key === 'hoursDiff' ? DIFF_LABEL[typeFilter] ?? col.label : col.label)
const colTitle = (col, typeFilter) => (col.key === 'hoursDiff' ? DIFF_TITLE[typeFilter] : undefined)

// "Simple" shows the columns every job has a figure for. The quoted-only columns
// (quoted profit/margin, quoted labour and cost) are blank for charge-up jobs —
// most rows — so they wait behind "Full".
const SIMPLE_KEYS = new Set(['jobNumber', 'jobName', 'type', 'gpPerHour', 'quotedHours', 'hours', 'hoursDiff', 'profitToDate', 'marginToDate'])

// Which cells turn red when a quoted job came in over quote on that measure.
const OVER_CELLS = { hours: ['hours', 'hoursDiff'], labour: ['labourActual'], cost: ['costActual'] }
const OVER = 'var(--viz-critical)'
const OVER_TINT = 'color-mix(in srgb, var(--viz-critical) 12%, transparent)'
const fmtOver = (o) => (o.unit === 'h' ? `${o.label} ${o.quoted} → ${o.actual} h` : `${o.label} ${money(o.quoted)} → ${money(o.actual)}`)

// Frozen leading columns (Job #, Job name) — widths so the second knows its left.
const STICKY_W = [98, 260]
const STICKY_LEFT = [0, STICKY_W[0]]

// Difference = quoted − actual hours. A charge-up job's quoted hours are Sold +
// Unsold and its actual hours are Sold, so its difference is its Unsold hours.
const hoursDiff = (j) => (j.quotedHours == null ? null : Math.round((j.quotedHours - j.hours) * 100) / 100)
function DiffHours({ job }) {
  const d = hoursDiff(job)
  if (d === null) return <span className="text-neutral-500">—</span>
  const title = job.type === 'chargeup'
    ? `${d} h booked but not sold (quoted ${job.quotedHours} h = ${job.hours} h sold + ${d} h unsold)`
    : d > 0 ? `${d} h under quote (${job.quotedHours} h quoted, ${job.hours} h worked)`
      : d < 0 ? `${-d} h over quote (${job.quotedHours} h quoted, ${job.hours} h worked)` : 'On quote'
  return <span title={title} className={d > 0 ? 'text-brand-green' : d < 0 ? 'text-red-400' : 'text-neutral-400'}>{d > 0 ? '+' : ''}{d}</span>
}

// The key figure: bigger than the rest of the row, with a bar against the best
// job shown. Green when at or above the overall rate of the jobs shown, red when
// the job lost money, otherwise plain.
function GpCell({ value, max, benchmark }) {
  if (value == null) return <span className="text-neutral-500">—</span>
  const w = max > 0 ? Math.min(100, (Math.max(0, value) / max) * 100) : 0
  const tone = value < 0 ? OVER : benchmark != null && value >= benchmark ? 'var(--brand-green)' : 'var(--text-secondary)'
  return (
    <span className="flex flex-col items-end gap-[3px]">
      <span className="text-[15px] font-semibold tabular-nums leading-none" style={{ color: tone }}>{cents(value)}</span>
      <span className="block h-[3px] w-16 overflow-hidden rounded-full bg-white/[0.07]" aria-hidden="true">
        <span className="block h-full rounded-full" style={{ width: `${w}%`, background: tone, opacity: 0.85 }} />
      </span>
    </span>
  )
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
            ? `${people.length} people worked on this job — each person's GP is split by the hours they worked.`
            : `${people.length} people worked on this job.`}
      </p>
      {people.length > 1 && (
        <div className={`${split ? GRID : GRID_ONE} text-[11px] uppercase tracking-wide text-neutral-500`}>
          <span>Person</span>
          <span />
          <span className="text-right">Hours</span>
          <span className="text-right">Share</span>
          {split && <span className="text-right">Their GP</span>}
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
          {split && <span className="text-right tabular-nums font-medium text-white">{cents(p.part)}</span>}
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

function Stat({ label, value, sub, tone, big, onClick, title }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} title={title}
      className={`flex min-w-0 flex-col gap-0.5 text-left ${onClick ? 'rounded-lg transition-colors hover:text-white' : ''}`}>
      <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">{label}</span>
      <span className={`${big ? 'text-[26px]' : 'text-[18px]'} font-semibold tabular-nums leading-tight text-white`} style={tone ? { color: tone } : undefined}>{value}</span>
      {sub && <span className="text-[12px] tabular-nums text-neutral-500">{sub}</span>}
    </Tag>
  )
}

// One strip instead of two cards: which month, the project GP/hr of the jobs
// shown, how many there are, how many are over quote, and how the month compares
// with the one before (when there is one).
function SummaryStrip({ jobs, previousJobs, previousMonth, typeFilter, toReview, onReview, month, months, onMonth }) {
  const st = typeStats(jobs)
  const prev = previousJobs ? typeStats(previousJobs) : null
  const delta = prev && st.gp != null && prev.gp != null ? st.gp - prev.gp : null
  const cu = jobs.filter((j) => j.type === 'chargeup'), q = jobs.filter((j) => j.type === 'quoted')
  const what = typeFilter === 'all' ? 'completed' : TYPE_LABEL[typeFilter].toLowerCase()
  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-[18px] border border-white/[0.06] bg-[#11161c] px-5 py-4">
      <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
        Month
        <select value={month} onChange={(e) => onMonth(e.target.value)}
          className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-[14px] font-medium normal-case tracking-normal text-white">
          {months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
          {months.length > 1 && <option value="all">All months</option>}
        </select>
      </label>
      <Stat big label={`Project GP/hr · ${what} jobs`} value={st.gp === null ? '—' : `${cents(st.gp)}/hr`}
        sub={`${money(st.profit)} profit to date ÷ ${st.hours} actual h`} />
      <Stat label="Jobs" value={st.count}
        sub={typeFilter === 'all' ? `${cu.length} charge-up · ${q.length} quoted` : undefined} />
      {typeFilter === 'all' && (
        <Stat label="By type" value={
          <span className="text-[14px] font-medium">
            <span className="text-neutral-300">Charge-up</span> {typeStats(cu).gp == null ? '—' : cents(typeStats(cu).gp)}
            <span className="mx-2 text-neutral-600">·</span>
            <span className="text-neutral-300">Quoted</span> {typeStats(q).gp == null ? '—' : cents(typeStats(q).gp)}
          </span>} sub="GP/hr" />
      )}
      <Stat label="Over quote" value={toReview.length} tone={toReview.length ? OVER : undefined}
        sub={toReview.length ? 'quoted jobs — review' : 'no quoted job over quote'}
        onClick={toReview.length ? onReview : undefined} title={toReview.length ? 'Show which jobs' : undefined} />
      {delta != null && (
        <Stat label={`vs ${monthName(previousMonth, 'short')}`} value={`${delta >= 0 ? '+' : '−'}${cents(Math.abs(delta))}/hr`}
          tone={delta >= 0 ? 'var(--brand-green)' : OVER} sub={`${cents(prev.gp)}/hr then`} />
      )}
    </div>
  )
}

const NOT_SET = 'Not set'
const SELECT = 'rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[13px] font-medium text-white'

// Data to check, set when the job was loaded — shown as a tooltip on the type:
// no name in Katipolt (named by its number), or no sold hours (so no GP/hr).
const CHECK_NOTE = { 'no-name': 'No name in Katipolt — add one there and re-upload.', 'no-sold-hours': 'No actual hours, so no GP/hr.' }
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

function HeadCell({ col, rowSpan, sub, sort, onSort, typeFilter, children }) {
  const on = sort.key === col.key
  const sticky = col.sticky !== undefined
  return (
    <th
      rowSpan={rowSpan}
      className={[col.num && 'num', 'sortable', sub && 'th-sub', sticky && 'sticky-col', col.sticky === 1 && 'sticky-col-end'].filter(Boolean).join(' ')}
      style={sticky ? { left: STICKY_LEFT[col.sticky], minWidth: STICKY_W[col.sticky], maxWidth: STICKY_W[col.sticky] } : undefined}
      onClick={() => onSort(col.key)}
      aria-sort={on ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
      title={colTitle(col, typeFilter)}
    >
      {children}
      {colLabel(col, typeFilter)}{col.key === 'hoursDiff' && <span className="ml-1 text-neutral-500" aria-hidden="true">ⓘ</span>}
      {on && (sort.dir === 1 ? ' ▲' : ' ▼')}
    </th>
  )
}

export default function CompletedJobsTab({ completedJobs, onBack, focusJob }) {
  const [sort, setSort] = useState({ key: 'gpPerHour', dir: -1 })
  const [typeFilter, setTypeFilter] = useLocalStorageState('completedJobs.typeFilter', 'all')
  const [workFilter, setWorkFilter] = useState(null)   // a type of work picked in the filter
  // Months with jobs, latest first; the page opens on the latest month.
  const months = useMemo(() => [...new Set(completedJobs.map((j) => j.month).filter(Boolean))].sort().reverse(), [completedJobs])
  const [monthPick, setMonthPick] = useState('latest')
  const month = monthPick === 'latest' ? (months[0] ?? 'all') : monthPick
  const inMonth = useMemo(() => (month === 'all' ? completedJobs : completedJobs.filter((j) => j.month === month)), [completedJobs, month])
  const previousMonth = month !== 'all' ? months[months.indexOf(month) + 1] : undefined
  const [howOpen, setHowOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [compareOpen, setCompareOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
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
  // "Simple" (the default) or "Full"; choosing groups in the picker means Full.
  const [preset, setPreset] = useLocalStorageState('completedJobs.columnPreset', 'simple')
  const [pickerOpen, setPickerOpen] = useState(false)
  // Ticked jobs: a Total row sums them, and "Show selected only" filters to them.
  const [selected, setSelected] = useState(() => new Set())
  const [selectedOnly, setSelectedOnly] = useState(false)
  const toggleSelected = (n) => setSelected((prev) => { const next = new Set(prev); next.has(n) ? next.delete(n) : next.add(n); return next })
  const hidden = new Set(hiddenGroups)
  const visibleCols = preset === 'simple'
    ? COLUMNS.filter((c) => SIMPLE_KEYS.has(c.key))
    : COLUMNS.filter((c) => !c.group || !hidden.has(c.group))
  const toggleGroup = (key) => { setPreset('full'); setHiddenGroups(hidden.has(key) ? hiddenGroups.filter((g) => g !== key) : [...hiddenGroups, key]) }
  // Header row 1: ungrouped columns span both rows; each visible group spans its columns.
  const headRow1 = []
  for (const c of visibleCols) {
    const g = c.group && GROUPS.find((x) => x.key === c.group)
    if (!g || g.flat) headRow1.push({ col: c })
    else if (headRow1.at(-1)?.group !== g) headRow1.push({ group: g, span: 1 })
    else headRow1.at(-1).span += 1
  }
  const subCols = visibleCols.filter((c) => c.group && !GROUPS.find((x) => x.key === c.group)?.flat)

  const toReview = useMemo(() => jobsToReview(inMonth), [inMonth])
  const [open, setOpen] = useState(() => new Set(focusJob ? [focusJob.job] : []))
  // Opened from the notifications bell: show that job's row, expanded, in view.
  function reviewJob(jobNumber) {
    setTypeFilter('all')
    setWorkFilter(null)
    const job = completedJobs.find((j) => j.jobNumber === jobNumber)
    if (job?.month && job.month !== month) setMonthPick(job.month)
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
    chargeup: inMonth.filter((j) => j.type === 'chargeup'),
    quoted: inMonth.filter((j) => j.type === 'quoted'),
  }), [inMonth])
  const byTypeShown = typeFilter === 'all' ? inMonth : (byType[typeFilter] ?? inMonth)
  const untyped = loaded ? byTypeShown.filter((j) => !categories?.[j.jobNumber]).length : 0
  const q = query.trim().toLowerCase()
  const shown = useMemo(() => {
    const pool = workFilter ? byTypeShown.filter((j) => (categories?.[j.jobNumber] || NOT_SET) === workFilter) : byTypeShown
    return q ? pool.filter((j) => String(j.jobNumber).includes(q) || (j.jobName ?? '').toLowerCase().includes(q)) : pool
  }, [byTypeShown, workFilter, categories, q])

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
  // For the GP/hr bars: the best rate shown, and the overall rate of what's shown.
  const gpMax = Math.max(0, ...shown.map((j) => projectGpPerHour(j) ?? 0))
  const gpBenchmark = typeStats(shown).gp

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
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-2xl font-semibold text-white">Completed jobs — GP per hour</h1>
          <button type="button" onClick={() => setHowOpen((v) => !v)} aria-expanded={howOpen}
            className="text-[13px] font-medium text-brand-green hover:underline">
            How this works {howOpen ? '▾' : '▸'}
          </button>
        </div>
        <div className="mt-1"><LastSynced kind="completed" /></div>
        {howOpen && (
          <div className="mt-3 flex max-w-3xl flex-col gap-2 rounded-[14px] border border-white/[0.06] bg-white/[0.02] p-4 text-sm text-neutral-400">
            <p>
              Project GP per hour for each finished job: its profit to date (the P&amp;L&apos;s actual
              profit) ÷ actual hours — for a charge-up job, the Sold tab&apos;s labour hours.
            </p>
            <p>
              Quoted h is a quoted job&apos;s quoted hours, or a charge-up job&apos;s sold + unsold hours.
              The difference column is quoted − actual: hours under quote for a quoted job, unsold hours for a charge-up job.
            </p>
            <p>
              GP/hr in <span className="text-brand-green">green</span> is at or above the overall rate of the jobs shown; the bar is against the best job shown.
              <span className="ml-1 inline-block h-3 w-3 translate-y-0.5 rounded-sm" style={{ background: OVER_TINT, boxShadow: `inset 4px 0 0 ${OVER}` }} aria-hidden="true" />{' '}
              Red rows are quoted jobs that came in over quote — the blinking figures are what went over.
            </p>
            <p>Click a job to see the working and who worked on it. Add a month&apos;s jobs in Update data → Completed jobs.</p>
          </div>
        )}
      </div>

      <SummaryStrip jobs={byTypeShown} typeFilter={typeFilter} toReview={toReview}
        onReview={() => setReviewOpen(true)}
        month={month} months={months} onMonth={setMonthPick}
        previousMonth={previousMonth}
        previousJobs={previousMonth ? completedJobs.filter((j) => j.month === previousMonth && (typeFilter === 'all' || j.type === typeFilter)) : null} />

      {toReview.length > 0 && (
        <div className="rounded-[14px] border" style={{ borderColor: `color-mix(in srgb, ${OVER} 45%, transparent)`, background: `color-mix(in srgb, ${OVER} 7%, transparent)` }}>
          <button type="button" onClick={() => setReviewOpen((v) => !v)} aria-expanded={reviewOpen}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[13px] font-medium" style={{ color: OVER }}>
            <span className="blink-over inline-block h-2 w-2 rounded-full" style={{ background: OVER }} aria-hidden="true" />
            {toReview.length} quoted job{toReview.length === 1 ? '' : 's'} over quote — review
            <span className="ml-1 text-neutral-400" aria-hidden="true">{reviewOpen ? '▾' : '▸'}</span>
          </button>
          {reviewOpen && (
            <ul className="flex flex-col gap-1 px-4 pb-3 text-[13px]">
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
          )}
        </div>
      )}

      {saveError && <p className="text-sm text-red-400">{saveError}</p>}

      <CollapsibleSection
        className="rounded-[18px] border border-white/[0.06] bg-[#11161c] p-6"
        storageKey="completed-jobs.table"
        title={`${rows.length} ${typeFilter === 'all' ? 'completed' : TYPE_LABEL[typeFilter].toLowerCase()} job${rows.length === 1 ? '' : 's'}${month !== 'all' ? ` · ${monthName(month)}` : ''}${workFilter ? ` · ${workFilter}` : ''}`}
      >
        {/* Selection bar: pinned to the top while jobs are ticked, with Compare
            right here rather than a long scroll below the table. */}
        {selected.size > 0 && (
          <div className="sticky top-0 z-30 -mx-6 mt-3 flex flex-wrap items-center gap-2 border-b border-brand-green/30 bg-inherit px-6 py-2.5">
            <span className="text-[13px] font-semibold text-brand-green">{selected.size} selected</span>
            <button type="button" onClick={() => setCompareOpen((v) => !v)} aria-expanded={compareOpen}
              className={`rounded-full border px-3 py-1 text-[12px] font-medium transition-colors ${
                compareOpen ? 'border-brand-green/50 bg-brand-green/15 text-brand-green' : 'border-brand-green/50 bg-brand-green/10 text-brand-green hover:bg-brand-green/15'
              }`}>
              Compare &amp; AI summary {compareOpen ? '▾' : '▸'}
            </button>
            <button type="button" onClick={() => setSelectedOnly((v) => !v)} aria-pressed={selectedOnly}
              className={`rounded-full border px-3 py-1 text-[12px] font-medium transition-colors ${
                selectedOnly ? 'border-brand-green/50 bg-brand-green/10 text-brand-green' : 'border-white/10 text-neutral-300 hover:border-white/20 hover:text-white'
              }`}>
              Show selected only
            </button>
            <button type="button" onClick={() => { setSelected(new Set()); setSelectedOnly(false); setCompareOpen(false) }}
              className="rounded-full border border-white/10 px-3 py-1 text-[12px] font-medium text-neutral-300 hover:border-white/20 hover:text-white">
              Clear
            </button>
            <span className="hidden text-[12px] text-neutral-500 sm:inline">The Total row at the foot of the table adds them up.</span>
          </div>
        )}
        {selected.size > 0 && compareOpen && <CompletedCompare jobs={selectedJobs} />}

        {/* Filters right above the table: search, job type, type of work. Counts in
            each option are for what the other filter currently leaves. On a phone
            this bar stays pinned while the cards scroll. */}
        <div className="sticky top-0 z-20 -mx-6 mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 bg-inherit px-6 py-2 sm:static sm:mx-0 sm:gap-x-5 sm:gap-y-2 sm:bg-transparent sm:px-0 sm:py-0">
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search job # or name"
            aria-label="Search completed jobs" className={`${SELECT} basis-full sm:basis-auto sm:w-56`} />
          <label className="flex min-w-0 basis-[47%] items-center gap-1.5 text-[12px] text-neutral-500 sm:basis-auto sm:gap-2">
            <span className="sm:hidden">Type</span><span className="hidden sm:inline">Job type</span>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={`${SELECT} min-w-0 flex-1 sm:flex-none`}>
              {TYPE_FILTERS.map((f) => {
                const pool = workFilter ? inMonth.filter((j) => (categories?.[j.jobNumber] || NOT_SET) === workFilter) : inMonth
                const n = f.key === 'all' ? pool.length : pool.filter((j) => j.type === f.key).length
                return <option key={f.key} value={f.key}>{f.label} ({n})</option>
              })}
            </select>
          </label>
          <label className="flex min-w-0 basis-[47%] items-center gap-1.5 text-[12px] text-neutral-500 sm:basis-auto sm:gap-2">
            <span className="sm:hidden">Work</span><span className="hidden sm:inline">Type of work</span>
            <select value={workFilter ?? ''} onChange={(e) => setWorkFilter(e.target.value || null)} className={`${SELECT} min-w-0 flex-1 sm:flex-none`}>
              {[null, ...JOB_CATEGORIES, NOT_SET].map((c) => {
                const pool = typeFilter === 'all' ? inMonth : inMonth.filter((j) => j.type === typeFilter)
                const n = c === null ? pool.length : pool.filter((j) => (categories?.[j.jobNumber] || NOT_SET) === c).length
                if (c !== null && c !== workFilter && !inMonth.some((j) => (categories?.[j.jobNumber] || NOT_SET) === c)) return null
                return <option key={c ?? 'all'} value={c ?? ''}>{c ?? 'All'} ({n})</option>
              })}
            </select>
          </label>
          {/* Phone: no column headers to click, so a sort picker instead. */}
          <label className="flex min-w-0 basis-[47%] items-center gap-1.5 text-[12px] text-neutral-500 sm:hidden">
            Sort
            <select value={sort.key} onChange={(e) => setSort({ key: e.target.value, dir: TEXT_SORTS.has(e.target.value) ? 1 : -1 })} className={`${SELECT} min-w-0 flex-1`}>
              {COLUMNS.map((c) => <option key={c.key} value={c.key}>{colLabel(c, typeFilter)}</option>)}
            </select>
            <button type="button" onClick={() => setSort((prev) => ({ ...prev, dir: -prev.dir }))}
              className="rounded-lg border border-white/10 px-2 py-1 text-[13px] text-neutral-300"
              aria-label={sort.dir === 1 ? 'Ascending — switch to descending' : 'Descending — switch to ascending'}>
              {sort.dir === 1 ? '▲' : '▼'}
            </button>
          </label>
          {untyped > 0 && workFilter !== NOT_SET && (
            <button type="button" onClick={() => setWorkFilter(NOT_SET)}
              className="min-w-0 flex-1 truncate rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-left text-[12px] font-medium text-amber-300 hover:bg-amber-400/15 sm:flex-none">
              {untyped} job{untyped === 1 ? '' : 's'} need{untyped === 1 ? 's' : ''} a type of work — show them
            </button>
          )}
          {workFilter === NOT_SET && untyped > 0 && (
            <span className="text-[12px] text-amber-300">Pick a type of work for each job in the Type of work column (Full columns).</span>
          )}
        </div>

        {/* Phone: one compact card per job — number, name, GP/hr and the hours
            line; tap for the rest (type of work, owner, the other figures, who
            worked on it). */}
        <div className="mt-3 flex flex-col gap-2 sm:hidden">
          {rows.map((j) => {
            const isOpen = open.has(j.jobNumber)
            const over = overruns(j)
            const d = hoursDiff(j)
            return (
              <div key={j.jobNumber}
                className="rounded-[12px] border border-white/[0.06] bg-white/[0.02]"
                style={over.length ? { background: OVER_TINT, boxShadow: `inset 4px 0 0 ${OVER}` } : undefined}>
                <div role="button" tabIndex={0} aria-expanded={isOpen}
                  onClick={() => toggleOpen(j.jobNumber)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleOpen(j.jobNumber) } }}
                  className="flex cursor-pointer items-start gap-3 p-3">
                  <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" aria-label={`Select job ${j.jobNumber}`}
                    checked={selected.has(j.jobNumber)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    onChange={() => toggleSelected(j.jobNumber)} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-neutral-500" title={checkNote(j)}>
                      {j.jobNumber} · {TYPE_LABEL[j.type] ?? j.type}
                      {over.length > 0 && <span className="ml-1.5 font-medium" style={{ color: OVER }}>· over quote</span>}
                    </p>
                    <p className="line-clamp-2 text-[13px] font-medium leading-snug text-white">{j.jobName}</p>
                    <p className="mt-1 text-[12px] tabular-nums text-neutral-400">
                      {j.hours} h{j.quotedHours != null && <> of {j.quotedHours} h</>}
                      {d !== null && <> · <DiffHours job={j} /> {j.type === 'chargeup' ? 'unsold' : d >= 0 ? 'under' : 'over'}</>}
                      {j.pl?.profitToDate != null && <> · {money(j.pl.profitToDate)} · {pct(j.pl.marginToDate)}</>}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <GpCell value={projectGpPerHour(j)} max={gpMax} benchmark={gpBenchmark} />
                    <span className="mt-1 block text-[10px] uppercase tracking-wide text-neutral-500">GP/hr</span>
                  </div>
                </div>
                {isOpen && (
                  <div className="flex flex-col gap-3 border-t border-white/10 p-3">
                    {over.length > 0 && (
                      <p className="text-[12px] font-medium" style={{ color: OVER }}>Over quote — review: {over.map(fmtOver).join(' · ')}</p>
                    )}
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
                      <span className="text-neutral-400">{DIFF_LABEL[j.type]}</span>
                      <span className="text-right tabular-nums"><DiffHours job={j} /></span>
                    </div>
                    <Breakdown job={j} />
                  </div>
                )}
              </div>
            )
          })}
          {rows.length === 0 && <p className="empty-row">{q || workFilter ? 'No jobs match.' : 'No completed jobs added yet.'}</p>}
        </div>

        <div className="relative mt-3 hidden items-center gap-2 sm:flex">
          <span className="text-[12px] text-neutral-500">Columns</span>
          <div className="flex overflow-hidden rounded-full border border-white/10 text-[12px] font-medium" role="group" aria-label="Column preset">
            {[['simple', 'Simple'], ['full', 'Full']].map(([k, label]) => (
              <button key={k} type="button" onClick={() => setPreset(k)} aria-pressed={preset === k}
                className={`px-3 py-1 transition-colors ${preset === k ? 'bg-brand-green/15 text-brand-green' : 'text-neutral-400 hover:text-white'}`}>
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            aria-expanded={pickerOpen}
            className="rounded-full border border-white/10 px-3 py-1 text-[12px] font-medium text-neutral-300 hover:border-white/20 hover:text-white"
          >
            Choose{preset === 'full' && hiddenGroups.length ? ` · ${hiddenGroups.length} hidden` : ''} ▾
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
              <p className="mt-1 text-[11px] text-neutral-500">Job #, job name and type always show. Ticking here switches to Full.</p>
            </div>
          )}
          <span className="text-[12px] text-neutral-500">Tick jobs to add them up and compare. Scroll inside the table — the header and job columns stay put.</span>
        </div>

        <div className="table-scroll table-freeze mt-2 hidden sm:block">
          <table className="data-table data-table--compact">
            <thead>
              <tr>
                {headRow1.map((h) => {
                  if (h.group) return <th key={h.group.key} colSpan={h.span} className="th-group">{h.group.label}</th>
                  const col = h.col
                  return (
                    <HeadCell key={col.key} col={col} rowSpan={subCols.length ? 2 : 1} sort={sort} onSort={toggleSort} typeFilter={typeFilter}>
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
                  {subCols.map((col) => <HeadCell key={col.key} col={col} sub sort={sort} onSort={toggleSort} typeFilter={typeFilter} />)}
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
                          case 'gpPerHour': content = <GpCell value={projectGpPerHour(j)} max={gpMax} benchmark={gpBenchmark} />; break
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
                    {q || workFilter ? 'No jobs match.' : 'No completed jobs added yet.'}
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
      </CollapsibleSection>
    </div>
  )
}
