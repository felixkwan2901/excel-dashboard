export default function Logo({ size = 34 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      className="logo-mark"
    >
      <circle
        cx="20"
        cy="20"
        r="15"
        stroke="var(--brand-green)"
        strokeWidth="7"
        strokeLinecap="round"
        pathLength="100"
        strokeDasharray="68 32"
        strokeDashoffset="0"
        transform="rotate(-100 20 20)"
      />
      <circle
        cx="20"
        cy="20"
        r="15"
        stroke="#f2f2f0"
        strokeWidth="7"
        strokeLinecap="round"
        pathLength="100"
        strokeDasharray="16 84"
        strokeDashoffset="-76"
        transform="rotate(-100 20 20)"
      />
    </svg>
  )
}
