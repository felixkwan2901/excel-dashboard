import AnimatedNumber from './AnimatedNumber'

// Renders as a real <button> when clickable, EXCEPT when a secondaryAction
// is also present — a button can't contain another button, so in that case
// the card becomes a div with its own role/keyboard handling and the
// secondary action renders as a sibling button in the corner.
export default function StatCard({
  icon: Icon,
  label,
  value,
  format,
  context,
  tone = 'neutral',
  onClick,
  secondaryAction,
}) {
  const emphasis = tone === 'critical'
  const clickableProps = onClick
    ? secondaryAction
      ? {
          role: 'button',
          tabIndex: 0,
          onClick,
          onKeyDown: (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onClick()
            }
          },
        }
      : { onClick }
    : {}
  const Tag = onClick && !secondaryAction ? 'button' : 'div'

  return (
    <Tag
      {...clickableProps}
      className={`relative flex min-h-[152px] w-full flex-col justify-between gap-5 rounded-[18px] border border-white/[0.06] bg-[#11161c] p-6 text-left shadow-[0_1px_2px_rgba(0,0,0,0.3)] hover:border-white/10 ${
        onClick
          ? 'cursor-pointer transition-[transform,border-color] duration-150 hover:-translate-y-0.5 hover:border-brand-green/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green'
          : 'transition-colors duration-300'
      }`}
    >
      {secondaryAction && <div className="absolute top-5 right-5">{secondaryAction}</div>}
      <span
        className={`flex h-8 w-8 items-center justify-center rounded-md ${
          emphasis ? 'bg-white/[0.1] text-neutral-100' : 'bg-white/[0.06] text-neutral-400'
        }`}
      >
        <Icon
          size={16}
          strokeWidth={1.75}
          aria-hidden="true"
          className={emphasis ? 'motion-safe:animate-[icon-pulse_2s_ease-in-out_infinite]' : undefined}
        />
      </span>
      <div>
        <p className="text-[42px] leading-none font-semibold tracking-tight text-white tabular-nums">
          <AnimatedNumber value={value} format={format} duration={500} />
        </p>
        <p className="mt-2.5 text-[15px] font-medium text-neutral-200">{label}</p>
        {context && <p className="mt-1 text-[13px] text-neutral-400 tabular-nums">{context}</p>}
      </div>
    </Tag>
  )
}
