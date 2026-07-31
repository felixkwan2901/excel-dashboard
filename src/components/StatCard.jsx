import AnimatedNumber from './AnimatedNumber'

export default function StatCard({ icon: Icon, label, value, format, tone = 'neutral' }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/[0.08] bg-[#111827] p-5">
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-lg ${
          tone === 'critical'
            ? 'bg-red-500/15 text-red-400'
            : tone === 'warning'
              ? 'bg-amber-500/15 text-amber-400'
              : 'bg-emerald-500/15 text-emerald-400'
        }`}
      >
        <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <div>
        <p className="text-2xl font-semibold text-white tabular-nums">
          <AnimatedNumber value={value} format={format} />
        </p>
        <p className="mt-1 text-sm text-neutral-400">{label}</p>
      </div>
    </div>
  )
}
