import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Printer } from 'lucide-react'

// A code to print and stick on the switchboard door.
//
// Scanning it opens this job's task list in the field app directly — no
// scrolling a list of thirty-one jobs, no typing a job number with gloves
// on, no picking the wrong one. Sites already run on scanning things, so it
// asks nothing new of the crew.
//
// Rendered as SVG rather than a canvas because this is made to be printed:
// a canvas prints at screen resolution and comes out fuzzy at the size a
// phone camera needs to read it from a metre away.
const FIELD_APP = 'https://www.kwanfelix.me/cde-field/'

export default function SiteQrCode({ jobNumber, jobName }) {
  const [svg, setSvg] = useState(null)
  const [error, setError] = useState(false)
  const url = `${FIELD_APP}?job=${encodeURIComponent(jobNumber)}`

  useEffect(() => {
    let cancelled = false
    QRCode.toString(url, {
      type: 'svg',
      margin: 1,
      // Medium correction: enough that a code on a dusty site board with a
      // scuffed corner still reads, without inflating the pattern so much
      // that it needs a bigger print.
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then((out) => {
        if (!cancelled) setSvg(out)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [url])

  if (error) {
    return <p className="text-[13px] text-neutral-400">Couldn&apos;t generate the code.</p>
  }

  return (
    <div className="site-qr mt-6 border-t border-white/[0.06] pt-5">
      <div className="flex flex-wrap items-start gap-5">
        {/* Always on white, in both themes. A dark-mode QR with a dark
            "quiet zone" is unreadable to a phone camera, and it would print
            as a black square. */}
        <div className="shrink-0 rounded-xl bg-white p-2.5">
          {svg ? (
            <div className="h-[132px] w-[132px] [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
          ) : (
            <div className="h-[132px] w-[132px] animate-pulse rounded bg-neutral-200" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-medium text-neutral-100">Site code</h3>
          <p className="mt-1 text-[13px] text-neutral-400">
            Print this and put it on the switchboard door or the site board. Scanning it opens{' '}
            {jobNumber} {jobName} in the field app, straight to the task list.
          </p>
          <p className="mt-2 break-all font-mono text-[11px] text-neutral-500">{url}</p>
          <button
            onClick={() => window.print()}
            className="no-print mt-3 flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-[12px] text-neutral-300 transition-colors hover:border-brand-green/50 hover:text-brand-green"
          >
            <Printer size={13} aria-hidden="true" />
            Print
          </button>
        </div>
      </div>
    </div>
  )
}
