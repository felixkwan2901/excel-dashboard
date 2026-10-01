import { COLOUR_KEY } from './colors'

// The one-line colour key shown above the charts.
export function ColourKey() {
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-neutral-400">
      <span className="text-neutral-500">Colours:</span>
      {COLOUR_KEY.map((k) => (
        <span key={k.label} className="flex items-center gap-1.5">
          {k.text
            ? <span className="font-semibold tabular-nums" style={{ color: k.color }}>$12</span>
            : <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: k.color }} />}
          {k.label}
        </span>
      ))}
    </p>
  )
}
