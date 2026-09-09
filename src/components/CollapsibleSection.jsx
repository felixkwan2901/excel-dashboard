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
      {/* Stacked on a phone. Side by side, the actions — a 144px rate input on
          Monthly claims — take their width first and leave the heading a
          ~50px column, which wraps "Jobs claimed this month" to one word per
          line. There is no room for both on 390px, so the actions go
          underneath rather than crushing the title. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
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
            {/* Hidden on a phone. These run to several lines of formula and
                push the actual figures below the fold on a screen that has
                none to spare; the explanation is still there on any wider
                screen, which is where someone reads it anyway. */}
            {description && !collapsed && (
              <span className="mt-0.5 hidden text-[12px] leading-relaxed text-neutral-400 sm:block">
                {description}
              </span>
            )}
          </span>
        </button>
        {/* Actions stay reachable while the section is open, and get out of
            the way when it's shut — a "+ Add staff" button above a folded
            table would add a row you can't see. */}
        {actions && !collapsed && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
      {!collapsed && children}
    </div>
  )
}
