import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronRight, Clock, Receipt, Tag, TrendingDown } from 'lucide-react'
import { fetchJobCategories } from '../lib/jobCategoryStore'
import { monthName, personMonthly } from '../lib/completedJobPeople'
import { cents } from '../lib/format'

// The first thing on the Overview: a short list of what needs doing right now,
// each line one click from the place to fix it. Lines with nothing to show are
// left out; when every line is clear the panel says so in one sentence.
const OVER = 'var(--viz-critical)'
const NOW_MONTH = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7)

function Line({ icon: Icon, tone, count, label, detail, action, onClick }) {
  return (
    <button type="button" onClick={onClick}
      className="group flex w-full items-center gap-4 rounded-[12px] border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-left transition-colors hover:border-white/20 hover:bg-white/[0.04]">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: `color-mix(in srgb, ${tone} 14%, transparent)`, color: tone }}>
        <Icon size={17} aria-hidden="true" />
      </span>
      <span className="w-10 shrink-0 text-[24px] font-semibold tabular-nums leading-none text-white">{count}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium text-white">{label}</span>
        {detail && <span className="block truncate text-[12.5px] text-neutral-400">{detail}</span>}
      </span>
      <span className="hidden shrink-0 items-center gap-1 text-[12.5px] font-medium text-neutral-400 group-hover:text-white sm:flex">
        {action} <ChevronRight size={14} aria-hidden="true" />
      </span>
    </button>
  )
}

export default function NeedsAttention({ jobs, completedJobs, completedReviews, monthlyClaims, onProjects, onCompleted, onMonthlyClaims, onInsights, onMonthEnd }) {
  // Type of work lives in KV, not in the job data — read it once for the count.
  const [categories, setCategories] = useState(null)
  useEffect(() => {
    let live = true
    fetchJobCategories().then((c) => { if (live) setCategories(c ?? {}) }).catch(() => { if (live) setCategories({}) })
    return () => { live = false }
  }, [])

  const lines = useMemo(() => {
    const out = []
    const flagged = jobs.filter((j) => j.flagged)
    if (flagged.length) out.push({ key: 'flagged', icon: AlertTriangle, tone: OVER, count: flagged.length,
      label: `Active job${flagged.length === 1 ? '' : 's'} over budget or losing margin`,
      detail: flagged.slice(0, 3).map((j) => `${j.jobNumber} ${j.jobName}`).join(' · ') + (flagged.length > 3 ? ' …' : ''),
      action: 'Review', onClick: () => onProjects('needsReview') })
    if (completedReviews.length) out.push({ key: 'over', icon: AlertTriangle, tone: OVER, count: completedReviews.length,
      label: `Completed quoted job${completedReviews.length === 1 ? '' : 's'} over quote`,
      detail: completedReviews.slice(0, 3).map(({ job, over }) => `${job.jobNumber} ${job.jobName} (${over.map((o) => o.label).join(', ')})`).join(' · ') + (completedReviews.length > 3 ? ' …' : ''),
      action: 'Review', onClick: () => onCompleted({ review: true }) })
    const stale = jobs.filter((j) => j.isStale)
    if (stale.length) out.push({ key: 'stale', icon: Clock, tone: 'var(--viz-1)', count: stale.length,
      label: `Job${stale.length === 1 ? '' : 's'} missing this week's update`,
      detail: 'No export uploaded for them this week — their figures are out of date.',
      action: 'See which', onClick: () => onProjects('stale') })
    const latest = [...new Set(completedJobs.map((j) => j.month).filter(Boolean))].sort().at(-1)
    const untyped = categories ? completedJobs.filter((j) => (!latest || j.month === latest) && !categories[j.jobNumber]) : []
    if (untyped.length) out.push({ key: 'untyped', icon: Tag, tone: '#f5b942', count: untyped.length,
      label: `Completed job${untyped.length === 1 ? '' : 's'} with no type of work`,
      detail: `${latest ? monthName(latest) : 'This month'} — they're left out of the by-type figures until set.`,
      action: 'Set them', onClick: () => onCompleted({ work: 'Not set' }) })
    const claims = monthlyClaims?.jobs ?? []
    const unclaimed = claims.filter((j) => (j.claim ?? 0) === 0 && (j.costs ?? 0) !== 0)
    if (claims.length && claims.every((j) => (j.claim ?? 0) === 0)) out.push({ key: 'claims', icon: Receipt, tone: '#f5b942', count: claims.length,
      label: 'Nothing claimed yet this month', detail: `${monthName(NOW_MONTH())} — no job has a claim entered.`,
      action: 'Monthly claims', onClick: onMonthlyClaims })
    else if (unclaimed.length) out.push({ key: 'claims', icon: Receipt, tone: 'var(--viz-1)', count: unclaimed.length,
      label: `Job${unclaimed.length === 1 ? '' : 's'} with costs this month but no claim`,
      detail: unclaimed.slice(0, 3).map((j) => `${j.jobNumber} ${j.jobName}`).join(' · ') + (unclaimed.length > 3 ? ' …' : ''),
      action: 'Monthly claims', onClick: onMonthlyClaims })
    const pm = personMonthly(completedJobs)
    const down = pm.people.filter((p) => p.flag)
    if (down.length) out.push({ key: 'people', icon: TrendingDown, tone: OVER, count: down.length,
      label: `${down.length === 1 ? 'Person' : 'People'} with a lower profit per hour than ${monthName(pm.previous, 'short')}`,
      detail: down.slice(0, 3).map((p) => `${p.name} ${cents(p.flag.before)} → ${cents(p.flag.now)}`).join(' · ') + (down.length > 3 ? ' …' : ''),
      action: 'By person', onClick: onInsights })
    return out
  }, [jobs, completedJobs, completedReviews, monthlyClaims, categories, onProjects, onCompleted, onMonthlyClaims, onInsights])

  return (
    <section className="rounded-[18px] border border-white/[0.06] bg-[#11161c] p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-white">Needs attention today</h2>
        <span className="flex items-center gap-3 text-[12px] text-neutral-500">
          {lines.length ? `${lines.length} thing${lines.length === 1 ? '' : 's'} to look at` : ''}
          {onMonthEnd && <button type="button" onClick={onMonthEnd} className="font-medium text-brand-green hover:underline">Month-end review ▸</button>}
        </span>
      </div>
      {lines.length === 0 ? (
        <p className="flex items-center gap-2 text-[14px] text-neutral-300">
          <CheckCircle2 size={18} className="text-brand-green" aria-hidden="true" />
          Nothing needs attention right now{categories === null ? ' (still checking types of work)' : ''}.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {lines.map((l) => <Line key={l.key} {...l} />)}
        </div>
      )}
    </section>
  )
}
