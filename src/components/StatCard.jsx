import AnimatedNumber from './AnimatedNumber'

export default function StatCard({ icon: Icon, label, value, format, tone = 'neutral' }) {
  const emphasis = tone === 'critical'

  return (
    <div className="flex min-h-[140px] flex-col justify-between gap-4 rounded-2xl border border-white/10 bg-[#12161c]/95 p-6 shadow-sm transition-colors duration-300 hover:border-white/20">
      <span
        className={`flex h-10 w-10 items-center justify-center rounded-lg ${
          emphasis ? 'bg-white/[0.12] text-white' : 'bg-white/[0.07] text-neutral-300'
        }`}
      >
        <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <div>
        <p className="text-3xl font-semibold text-white tabular-nums">
          <AnimatedNumber value={value} format={format} />
        </p>
        <p className="mt-1 text-xs font-medium tracking-wide text-neutral-500 uppercase">{label}</p>
      </div>
    </div>
  )
}
