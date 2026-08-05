import { AlertTriangle, Briefcase, Printer } from 'lucide-react'
import StatCard from './StatCard'
import MarginMeterCard from './MarginMeterCard'

const CURRENCY = new Intl.NumberFormat('en-NZ', {
  style: 'currency',
  currency: 'NZD',
  maximumFractionDigits: 0,
  notation: 'compact',
})

export default function StatsRow({ kpis, onSelectFilter, onPrintReport }) {
  const needsReviewContext =
    kpis.needsReviewCount > 0
      ? `${kpis.overBudgetCount} over budget, ${kpis.losingMarginCount} losing margin`
      : 'Nothing flagged'

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
      <StatCard
        icon={Briefcase}
        label="Active jobs"
        value={kpis.activeJobs}
        context={`${CURRENCY.format(kpis.totalQuotedValue)} quoted total`}
        onClick={onSelectFilter ? () => onSelectFilter('all') : undefined}
      />
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
      <MarginMeterCard
        actual={kpis.dollarWeightedAvgMargin}
        target={kpis.avgQuotedMargin}
        simpleAvg={kpis.avgMargin}
      />
    </div>
  )
}
