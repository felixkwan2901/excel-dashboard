import { useState } from 'react'
import { AlertTriangle, Briefcase, GripVertical, Printer, Settings2 } from 'lucide-react'
import StatCard from './StatCard'
import MarginMeterCard from './MarginMeterCard'
import { useLocalStorageState } from '../lib/useLocalStorageState'

const CURRENCY = new Intl.NumberFormat('en-NZ', {
  style: 'currency',
  currency: 'NZD',
  maximumFractionDigits: 0,
  notation: 'compact',
})

const WIDGETS = [
  { key: 'activeJobs', label: 'Active jobs' },
  { key: 'needsReview', label: 'Needs review' },
  { key: 'marginMeter', label: 'Margin meter' },
]
const DEFAULT_ORDER = WIDGETS.map((w) => w.key)

export default function StatsRow({ kpis, onSelectFilter, onPrintReport }) {
  const [order, setOrder] = useLocalStorageState('home.statsOrder', DEFAULT_ORDER)
  const [visibleKeys, setVisibleKeys] = useLocalStorageState(
    'home.statsVisible',
    new Set(DEFAULT_ORDER),
    { serialize: (s) => JSON.stringify([...s]), deserialize: (s) => new Set(JSON.parse(s)) }
  )
  const [panelOpen, setPanelOpen] = useState(false)
  const [dragKey, setDragKey] = useState(null)

  // A widget list added/removed later shouldn't lose a returning visitor's
  // persisted order entirely — keep whatever they had (filtered to widgets
  // that still exist), then append anything new at the end.
  const safeOrder = [
    ...order.filter((k) => DEFAULT_ORDER.includes(k)),
    ...DEFAULT_ORDER.filter((k) => !order.includes(k)),
  ]

  function toggleVisible(key) {
    setVisibleKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function moveTo(targetKey) {
    if (!dragKey || dragKey === targetKey) return
    setOrder((prev) => {
      const cur = prev.includes(dragKey) ? [...prev] : safeOrder
      const next = cur.filter((k) => k !== dragKey)
      next.splice(next.indexOf(targetKey), 0, dragKey)
      return next
    })
    setDragKey(null)
  }

  const needsReviewContext =
    kpis.needsReviewCount > 0
      ? `${kpis.overBudgetCount} over budget, ${kpis.losingMarginCount} losing margin`
      : 'Nothing flagged'

  const widgetContent = {
    activeJobs: (
      <StatCard
        icon={Briefcase}
        label="Active jobs"
        value={kpis.activeJobs}
        context={`${CURRENCY.format(kpis.totalQuotedValue)} quoted total`}
        onClick={onSelectFilter ? () => onSelectFilter('all') : undefined}
      />
    ),
    needsReview: (
      <StatCard
        icon={AlertTriangle}
        label="Needs review"
        value={kpis.needsReviewCount}
        context={needsReviewContext}
        tone={kpis.needsReviewCount > 0 ? 'critical' : 'neutral'}
        onClick={onSelectFilter ? () => onSelectFilter('needsReview') : undefined}
        secondaryAction={
          onPrintReport && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onPrintReport()
              }}
              aria-label="Print needs-review report"
              title="Print needs-review report"
              className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-white/[0.08] hover:text-white"
            >
              <Printer size={15} strokeWidth={1.75} aria-hidden="true" />
            </button>
          )
        }
      />
    ),
    marginMeter: (
      <MarginMeterCard
        actual={kpis.dollarWeightedAvgMargin}
        target={kpis.avgQuotedMargin}
        simpleAvg={kpis.avgMargin}
      />
    ),
  }

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          onClick={() => setPanelOpen((v) => !v)}
          aria-pressed={panelOpen}
          className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
            panelOpen
              ? 'border-brand-green/50 bg-brand-green/10 text-brand-green'
              : 'border-white/10 text-neutral-400 hover:border-white/20 hover:text-white'
          }`}
        >
          <Settings2 size={14} aria-hidden="true" />
          Customize
        </button>
      </div>

      {panelOpen && (
        <div className="mb-4 flex flex-wrap items-center gap-4 rounded-[18px] border border-white/[0.06] bg-[#11161c] p-4">
          {WIDGETS.map((w) => (
            <label key={w.key} className="flex items-center gap-2 text-[13px] text-neutral-300">
              <input type="checkbox" checked={visibleKeys.has(w.key)} onChange={() => toggleVisible(w.key)} />
              {w.label}
            </label>
          ))}
          <p className="text-[12px] text-neutral-500">Drag a tile below by its handle to reorder.</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        {safeOrder
          .filter((key) => visibleKeys.has(key))
          .map((key) => (
            <div
              key={key}
              className="relative"
              onDragOver={(e) => {
                if (dragKey) e.preventDefault()
              }}
              onDrop={(e) => {
                e.preventDefault()
                moveTo(key)
              }}
            >
              {panelOpen && (
                <div
                  draggable
                  onDragStart={() => setDragKey(key)}
                  onDragEnd={() => setDragKey(null)}
                  title="Drag to reorder"
                  className="absolute -top-2 -left-2 z-10 flex h-6 w-6 cursor-grab items-center justify-center rounded-full border border-white/10 bg-[#11161c] text-neutral-400 active:cursor-grabbing"
                >
                  <GripVertical size={13} aria-hidden="true" />
                </div>
              )}
              {widgetContent[key]}
            </div>
          ))}
      </div>
    </div>
  )
}
