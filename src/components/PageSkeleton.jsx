// What a page looks like while the workbook loads: the shape of the content
// (a heading, a strip of cards, table rows) in soft blocks, instead of one
// line of text on an empty screen. Pulses only for people who haven't asked
// their system for less motion.
const Block = ({ className }) => <div className={`rounded-md bg-white/[0.06] motion-safe:animate-pulse ${className}`} />

export default function PageSkeleton({ rows = 8 }) {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-2">
        <Block className="h-7 w-72" />
        <Block className="h-4 w-44" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-3 rounded-[18px] border border-white/[0.06] bg-[#11161c] p-5">
            <Block className="h-3 w-24" />
            <Block className="h-8 w-20" />
            <Block className="h-3 w-36" />
          </div>
        ))}
      </div>
      <div className="rounded-[18px] border border-white/[0.06] bg-[#11161c] p-6">
        <Block className="mb-4 h-5 w-48" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="grid grid-cols-[80px_1fr_100px_100px_80px] gap-4">
              <Block className="h-4" /><Block className="h-4" /><Block className="h-4" /><Block className="h-4" /><Block className="h-4" />
            </div>
          ))}
        </div>
      </div>
      <p className="sr-only">Loading the workbook…</p>
    </div>
  )
}
