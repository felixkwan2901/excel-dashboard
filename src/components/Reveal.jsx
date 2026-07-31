import { motion } from 'framer-motion'

// Scroll-triggered fade-in used to reveal page sections one at a time.
// `index` drives the stagger delay so sections in view together reveal
// in sequence rather than all at once.
export default function Reveal({ children, index = 0, as = 'div', className }) {
  const MotionTag = motion[as] ?? motion.div

  return (
    <MotionTag
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.5, delay: index * 0.12, ease: 'easeOut' }}
    >
      {children}
    </MotionTag>
  )
}
