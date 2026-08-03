import AnimatedNumber from './AnimatedNumber'

export default function StatCard({ icon: Icon, label, value, format, context, tone = 'neutral' }) {
  const emphasis = tone === 'critical'

  return (
    <div className="flex min-h-[152px] flex-col justify-between gap-5 rounded-[18px] border border-white/[0.06] bg-[#11161c] p-6 shadow-[0_1px_2px_rgba(0,0,0,0.3)] transition-colors duration-300 hover:border-white/10">
      <span
        className={`flex h-8 w-8 items-center justify-center rounded-md ${
          emphasis ? 'bg-white/[0.1] text-neutral-100' : 'bg-white/[0.06] text-neutral-400'
        }`}
      >
        <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <div>
        <p className="text-[42px] leading-none font-semibold tracking-tight text-white tabular-nums">
          <AnimatedNumber value={value} format={format} />
        </p>
        <p className="mt-2.5 text-[15px] font-medium text-neutral-200">{label}</p>
        {context && <p className="mt-1 text-[13px] text-neutral-500">{context}</p>}
      </div>
    </div>
  )
}
