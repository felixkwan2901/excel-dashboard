import { percent } from '../lib/format'

// Replaces the old static "Flagged/OK" badge — a fixed point-in-time state
// isn't very meaningful for a job that's never actually "done" until it's
// done. This shows which way the job's margin has moved between its last
// two logged weeks instead, which is the more actionable signal: a job
// trending worse needs attention regardless of where it currently sits,
// and one trending better may not need it even if it's still projected
// over budget.
const TREND_STEADY_THRESHOLD = 0.005 // ±0.5 margin points reads as noise, not a real move

export default function TrendBadge({ marginTrend }) {
  if (marginTrend === null) {
    return (
      <span className="badge badge--passed">
        <span className="badge__icon" aria-hidden="true">
          –
        </span>
        Too early
      </span>
    )
  }

  if (marginTrend > TREND_STEADY_THRESHOLD) {
    return (
      <span className="badge badge--passed">
        <span className="badge__icon" aria-hidden="true">
          ▲
        </span>
        Improving (+{percent(marginTrend)})
      </span>
    )
  }

  if (marginTrend < -TREND_STEADY_THRESHOLD) {
    return (
      <span className="badge badge--flagged">
        <span className="badge__icon" aria-hidden="true">
          ▼
        </span>
        Worsening ({percent(marginTrend)})
      </span>
    )
  }

  return (
    <span className="badge badge--passed">
      <span className="badge__icon" aria-hidden="true">
        –
      </span>
      Steady
    </span>
  )
}
