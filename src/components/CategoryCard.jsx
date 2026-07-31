import { Building2, ChevronRight, Home, Wind } from 'lucide-react'
import { motion } from 'framer-motion'
import ProgressBar from './ProgressBar'

const ICONS = {
  Commercial: Building2,
  Residential: Home,
  'Home Ventilation': Wind,
}

function progressTone(cat) {
  if (cat.urgentCount > 0) return 'critical'
  if (cat.pendingCount > 0) return 'warning'
  return 'good'
}

function summaryLine(cat) {
  const parts = []
  if (cat.pendingCount > 0) parts.push(`${cat.pendingCount} pending approval`)
  if (cat.urgentCount > 0) parts.push(`${cat.urgentCount} urgent`)
  return parts.length ? parts.join(' • ') : 'All on track'
}

export default function CategoryCard({ category: cat, index, onSelect }) {
  const Icon = ICONS[cat.name] ?? Building2

  return (
    <motion.button
      onClick={() => onSelect(cat.name)}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02, y: -4 }}
      whileFocus={{ scale: 1.02, y: -4 }}
      transition={{ duration: 0.4, delay: index * 0.08, ease: 'easeOut' }}
      className="group flex flex-col gap-5 rounded-2xl border border-white/10 bg-[#111827] p-6 text-left transition-colors hover:border-emerald-500/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
          <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <span className="rounded-full border border-emerald-500/25 bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-400">
          {cat.jobCount} active jobs
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-2xl font-semibold text-white">{cat.name}</span>
        <span className="text-sm text-neutral-400">{summaryLine(cat)}</span>
      </div>

      <ProgressBar percent={cat.progressPercent} tone={progressTone(cat)} />

      <div className="flex items-center justify-end border-t border-white/10 pt-4 text-sm">
        <span className="flex items-center gap-1 font-semibold text-emerald-400">
          View category
          <ChevronRight
            size={14}
            className="transition-transform duration-200 group-hover:translate-x-1"
            aria-hidden="true"
          />
        </span>
      </div>
    </motion.button>
  )
}
