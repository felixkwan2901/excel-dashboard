import { motion } from 'framer-motion'

// Fade-in used to reveal page sections one at a time. `index` drives the
// stagger delay so sections reveal in sequence rather than all at once.
//
// This used to gate on `whileInView` (only animating once an
// IntersectionObserver reported the element as scrolled into view), which
// is right for a reveal further down a long page — but every one of this
// app's per-view sections sits at the very top of the viewport the moment
// you navigate to it. An observer that never gets a "now visible" edge to
// fire on (already-in-view at mount, right after a PWA reload, etc.) left
// the whole page stuck at opacity 0 forever, indistinguishable from a
// blank page. `animate` fires unconditionally on mount instead.
export default function Reveal({ children, index = 0, as = 'div', className }) {
  const MotionTag = motion[as] ?? motion.div

  return (
    <MotionTag
      className={className}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.12, ease: 'easeOut' }}
    >
      {children}
    </MotionTag>
  )
}
