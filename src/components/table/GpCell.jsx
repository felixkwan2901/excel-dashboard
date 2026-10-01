import { cents } from '../../lib/format'

// A GP/hr figure, bigger than the rest of the row, with a bar against the best
// value shown. Green when at or above the benchmark (the overall rate of the
// jobs shown), red when negative, otherwise plain. Shared by every table that
// shows a GP/hr.
export default function GpCell({ value, max, benchmark, suffix = '' }) {
  if (value == null) return <span className="text-neutral-500">—</span>
  const w = max > 0 ? Math.min(100, (Math.max(0, value) / max) * 100) : 0
  const tone = value < 0 ? 'var(--viz-critical)' : benchmark != null && value >= benchmark ? 'var(--brand-green)' : 'var(--text-secondary)'
  return (
    <span className="flex flex-col items-end gap-[3px]">
      <span className="text-[15px] font-semibold tabular-nums leading-none" style={{ color: tone }}>{cents(value)}{suffix}</span>
      <span className="block h-[3px] w-16 overflow-hidden rounded-full bg-white/[0.07]" aria-hidden="true">
        <span className="block h-full rounded-full" style={{ width: `${w}%`, background: tone, opacity: 0.85 }} />
      </span>
    </span>
  )
}
