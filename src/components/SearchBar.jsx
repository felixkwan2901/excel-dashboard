import { useEffect, useRef } from 'react'
import { Search } from 'lucide-react'

export default function SearchBar({ value, onChange, onSubmit }) {
  const inputRef = useRef(null)

  useEffect(() => {
    function onKeyDown(e) {
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'
      if (isCmdK) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <form onSubmit={onSubmit} className="relative w-full max-w-md" role="search">
      <Search
        size={16}
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-neutral-500"
        aria-hidden="true"
      />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search jobs, clients, categories…"
        aria-label="Search jobs, clients, or categories"
        className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] py-2 pr-14 pl-9 text-sm text-white placeholder:text-neutral-500 focus:border-brand-green/50 focus:outline-none"
      />
      <kbd className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded border border-white/[0.08] px-1.5 py-0.5 text-[11px] text-neutral-500">
        ⌘K
      </kbd>
    </form>
  )
}
