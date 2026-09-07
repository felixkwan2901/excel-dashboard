import { useState } from 'react'

// A panel whose body can be folded away. The tables on this dashboard are
// long and several sit on the same screen, so being able to shut the ones
// you're not reading is the difference between scrolling past three
// screenfuls and seeing the row you want.
//
// Open/closed is remembered per section in localStorage rather than in the
// shared store: it's a view preference for whoever is sitting at this
// browser, not data about the business, and it shouldn't fold a section
// shut on someone else's screen.
function readStored(storageKey, fallback) {
  if (!storageKey) return fallback
  try {
    const raw = localStorage.getItem(`collapsed:${storageKey}`)
    return raw === null ? fallback : raw === '1'
  } catch {
    // Private browsing, or storage disabled — a preference isn't worth an
    // exception, so just start from the default.
    return fallback
  }
}

export default function CollapsibleSection({
  title,
  description,
  actions,
  storageKey,
  defaultCollapsed = false,
  headingLevel: Heading = 'h2',
  headingClassName = 'text-[15px] font-medium text-neutral-100',
  className = '',
  children,
}) {
  const [collapsed, setCollapsed] = useState(() => readStored(storageKey, defaultCollapsed))

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev
      if (storageKey) {
        try {
          localStorage.setItem(`collapsed:${storageKey}`, next ? '1' : '0')
        } catch {
          // Preference just won't stick; the section still opens and closes.
        }
      }
      return next
    })
  }

  return (
    <div className={className}>
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          className="group flex min-w-0 flex-1 items-start gap-2 text-left"
        >
          <svg
            viewBox="0 0 16 16"
            aria-hidden="true"
            className={`mt-[3px] h-3.5 w-3.5 shrink-0 text-neutral-500 transition-transform group-hover:text-neutral-300 ${
              collapsed ? '-rotate-90' : ''
            }`}
          >
            <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="min-w-0">
            <Heading className={headingClassName}>{title}</Heading>
            {description && !collapsed && (
              <span className="mt-0.5 block text-[12px] leading-relaxed text-neutral-400">{description}</span>
            )}
          </span>
        </button>
        {/* Actions stay reachable while the section is open, and get out of
            the way when it's shut — a "+ Add staff" button above a folded
            table would add a row you can't see. */}
        {actions && !collapsed && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {!collapsed && children}
    </div>
  )
}
