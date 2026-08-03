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

function onTrackCount(cat) {
  return Math.max(cat.jobCount - cat.pendingCount - cat.urgentCount, 0)
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
      className={`group relative flex flex-col justify-end overflow-hidden rounded-[18px] border border-white/[0.06] text-left transition-colors hover:border-brand-green/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green ${
        isLarge ? 'min-h-[300px] p-7 sm:min-h-[380px]' : 'min-h-[280px] p-6 sm:min-h-[340px]'
      }`}
    >
      {image && (
        <>
          <div
            className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105 [filter:brightness(0.75)_contrast(0.95)_saturate(0.9)]"
            style={{ backgroundImage: `url(${image})` }}
            aria-hidden="true"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(0deg, rgba(5,6,8,0.92) 0%, rgba(5,6,8,0.62) 45%, rgba(5,6,8,0.18) 100%)',
            }}
            aria-hidden="true"
          />
        </>
      )}

      <div className="relative flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-white/[0.08] text-neutral-300">
          <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <span className={`font-semibold text-white ${isLarge ? 'text-2xl' : 'text-xl'}`}>
          {cat.name}
        </span>
      </div>

      <div className="relative mt-5">
        <ProgressBar percent={cat.progressPercent} tone={progressTone(cat)} />
      </div>

      <div className="relative mt-5 grid grid-cols-3 divide-x divide-white/10">
        <div className="pr-3">
          <p className="text-lg font-semibold text-white tabular-nums">{onTrackCount(cat)}</p>
          <p className="mt-0.5 text-[12px] text-neutral-500">Active</p>
        </div>
        <div className="px-3">
          <p className="text-lg font-semibold text-white tabular-nums">{cat.pendingCount}</p>
          <p className="mt-0.5 text-[12px] text-neutral-500">Pending</p>
        </div>
        <div className="pl-3">
          <p className="text-lg font-semibold text-white tabular-nums">{cat.urgentCount}</p>
          <p className="mt-0.5 text-[12px] text-neutral-500">Urgent</p>
        </div>
      </div>

      <div className="relative mt-5 flex items-center justify-end border-t border-white/10 pt-4 text-sm">
        <span className="flex items-center gap-1 font-semibold text-neutral-300 transition-colors group-hover:text-brand-green">
          View details
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
