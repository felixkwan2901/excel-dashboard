import logoMark from '../assets/logo-mark.png'

export default function Logo({ size = 34 }) {
  return (
    <img
      src={logoMark}
      alt=""
      width={size}
      height={size}
      className="logo-mark object-contain"
      aria-hidden="true"
    />
  )
}
