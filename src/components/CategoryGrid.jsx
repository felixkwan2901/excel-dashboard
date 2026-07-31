import { Building2, Home, Wind } from 'lucide-react'
import commercialImg from '../assets/category-commercial.jpg'
import residentialImg from '../assets/category-residential.jpg'
import ventilationImg from '../assets/category-ventilation.jpg'

const ICONS = {
  Commercial: Building2,
  Residential: Home,
  'Home Ventilation': Wind,
}

const IMAGES = {
  Commercial: commercialImg,
  Residential: residentialImg,
  'Home Ventilation': ventilationImg,
}

function summaryLine(cat) {
  const parts = []
  if (cat.pendingCount > 0) parts.push(`${cat.pendingCount} pending approval`)
  if (cat.urgentCount > 0) parts.push(`${cat.urgentCount} urgent`)
  return parts.length ? parts.join(' • ') : 'All on track'
}

export default function CategoryGrid({ categories, onSelect }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {categories.map((cat) => {
        const Icon = ICONS[cat.name] ?? Building2
        return (
          <button
            key={cat.name}
            onClick={() => onSelect(cat.name)}
            className="group relative flex h-56 flex-col justify-between overflow-hidden rounded-2xl border border-white/10 p-5 text-left transition-all hover:-translate-y-1 hover:border-emerald-500/50 hover:shadow-xl hover:shadow-black/40"
          >
            <img
              src={IMAGES[cat.name]}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 -z-10 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
            <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/55 via-black/10 to-black/70" />

            <div className="flex items-start justify-between gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 backdrop-blur-sm">
                <Icon size={20} strokeWidth={1.75} />
              </span>
              <span className="rounded-full border border-emerald-500/25 bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-400 backdrop-blur-sm">
                {cat.jobCount} active jobs
              </span>
            </div>

            <div>
              <div className="mb-3 flex flex-col gap-1">
                <span className="text-lg font-semibold text-white">{cat.name}</span>
                <span className="text-xs text-neutral-300">{summaryLine(cat)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-white/10 pt-3 text-xs text-neutral-300">
                <span>View category</span>
                <span
                  className="transition-transform group-hover:translate-x-1 group-hover:text-emerald-400"
                  aria-hidden="true"
                >
                  →
                </span>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
