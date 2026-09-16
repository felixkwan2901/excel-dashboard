import { useState } from 'react'

// The frame every chart on the Charts tab sits in: heading, the one-line
// question it answers, a legend when there's more than one series, and a
// table of the same numbers.
//
// The table isn't a nicety. A chart encodes values as pixel lengths, which is
// no use to a screen reader and no use to anyone who wants the exact figure —
// so the same data is always available as text underneath.
//
// That table used to be screen-reader-only, which meant every exact figure on
// this page existed and was withheld from the people looking at it. A chart
// answers "is this normal"; the number answers "what is it", and on a page
// about money both questions get asked in the same breath. Figures now opens
// it. Closed by default, because eight tables open at once is a spreadsheet,
// and a spreadsheet is what this page exists to improve on.
export default function ChartCard({ title, question, series, footnote, table, children }) {
  const [showFigures, setShowFigures] = useState(false)
  return (
    <section className="rounded-[18px] border border-white/[0.06] bg-[#11161c] p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-[15px] font-medium text-neutral-100">{title}</h2>
          {question && <p className="mt-0.5 text-[12px] text-neutral-400">{question}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {series && series.length > 1 && (
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {series.map((s) => (
              <li key={s.name} className="flex items-center gap-1.5 text-[12px] text-neutral-300">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                  style={{ background: s.color }}
                />
                {s.name}
              </li>
            ))}
          </ul>
        )}
        {table && (
          <button
            type="button"
            onClick={() => setShowFigures((v) => !v)}
            aria-expanded={showFigures}
            className="chart-figures-toggle shrink-0 rounded-md px-2.5 py-1 text-[12px]"
          >
            {showFigures ? 'Hide figures' : 'Figures'}
          </button>
        )}
        </div>
      </div>

      <div className="mt-4">{children}</div>

      {footnote && <p className="mt-3 text-[12px] text-neutral-400">{footnote}</p>}

      {/* One copy, not two. Rendered visibly when open and screen-reader-only
          when closed, so assistive technology always reaches the numbers and
          never reads them twice. */}
      {table && (
        <div className={showFigures ? 'chart-figures mt-4' : 'sr-only'}>{table}</div>
      )}
    </section>
  )
}

// Shared tooltip. Positioned against the chart's own box rather than the page,
// and pointer-events-none so it can never eat the hover that spawned it.
export function ChartTooltip({ x, y, width, children }) {
  const flip = x > width * 0.6
  return (
    <div
      className="chart-tip pointer-events-none absolute z-10 min-w-[132px] rounded-lg border border-white/10 bg-[#161c24] px-3 py-2 text-[12px] text-neutral-200 shadow-lg"
      style={{
        left: flip ? undefined : x + 12,
        right: flip ? width - x + 12 : undefined,
        top: Math.max(0, y - 12),
      }}
    >
      {children}
    </div>
  )
}
