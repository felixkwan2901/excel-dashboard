import { Building2, ChevronRight, Home, Wind } from 'lucide-react'
import { motion } from 'framer-motion'
import ProgressBar from './ProgressBar'
import categoryCommercial from '../assets/category-commercial.jpg'
import categoryResidential from '../assets/category-residential.jpg'
import categoryVentilation from '../assets/category-ventilation.jpg'

const ICONS = {
  Commercial: Building2,
  Residential: Home,
  'Home Ventilation': Wind,
}

const IMAGES = {
  Commercial: categoryCommercial,
  Residential: categoryResidential,
  'Home Ventilation': categoryVentilation,
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

export default function CategoryCard({ category: cat, index, onSelect, size = 'compact' }) {
  const Icon = ICONS[cat.name] ?? Building2
  const image = IMAGES[cat.name]
  const isLarge = size === 'large'

  return (
    <motion.button
      onClick={() => onSelect(cat.name)}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.01, y: -4 }}
      whileFocus={{ scale: 1.01, y: -4 }}
      transition={{ duration: 0.4, delay: index * 0.08, ease: 'easeOut' }}
      className={`group relative flex flex-col justify-end overflow-hidden rounded-2xl border border-white/10 text-left transition-colors hover:border-emerald-500/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 ${
        isLarge ? 'min-h-[280px] p-7 sm:min-h-[360px]' : 'min-h-[260px] p-6 sm:min-h-[320px]'
      }`}
    >
      {image && (
        <>
          <div
            className="absolute inset-0 bg-cover bg-center brightness-[0.55] saturate-[0.6] transition-transform duration-500 group-hover:scale-105"
            style={{ backgroundImage: `url(${image})` }}
            aria-hidden="true"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(0deg, rgba(5,5,5,0.97) 0%, rgba(5,5,5,0.75) 45%, rgba(5,5,5,0.35) 100%)',
            }}
            aria-hidden="true"
          />
        </>
      )}

      <div className="relative flex items-start justify-between gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-white">
          <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-semibold text-neutral-200">
          {cat.jobCount} active
        </span>
      </div>

      <div className="relative mt-auto flex flex-col gap-1.5 pt-6">
        <span className={`font-semibold text-white ${isLarge ? 'text-3xl' : 'text-xl'}`}>
          {cat.name}
        </span>
        <span className="text-sm text-neutral-400">{summaryLine(cat)}</span>
      </div>

      <div className="relative mt-4">
        <ProgressBar percent={cat.progressPercent} tone={progressTone(cat)} />
      </div>

      <div className="relative mt-4 flex items-center justify-end border-t border-white/10 pt-4 text-sm">
        <span className="flex items-center gap-1 font-semibold text-neutral-300 transition-colors group-hover:text-emerald-400">
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
