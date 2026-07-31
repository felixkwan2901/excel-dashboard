import { motion } from 'framer-motion'

const TONE_COLOR = {
  good: 'var(--status-good)',
  warning: 'var(--status-warning)',
  critical: 'var(--status-critical)',
}

export default function ProgressBar({ percent, tone = 'good', label }) {
  return (
    <div role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      {label && (
        <div className="mb-1.5 flex items-center justify-between text-xs text-neutral-400">
          <span>{label}</span>
          <span className="tabular-nums">{percent}%</span>
        </div>
      )}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
        <motion.div
          className="h-full rounded-full"
          style={{ background: TONE_COLOR[tone] }}
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
        />
      </div>
    </div>
  )
}
