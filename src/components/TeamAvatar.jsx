import { useState } from 'react'
import { initials, teamMember } from '../lib/teamPhotos'

// A face beside a name. The photo from the company's team page where there is
// one; initials on a green plate where there isn't, or if it fails to load.
export default function TeamAvatar({ name, size = 36, className = '' }) {
  const [broken, setBroken] = useState(false)
  const member = teamMember(name)
  const photo = member?.photo && !broken ? member.photo : null
  return (
    <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-green/15 text-brand-green ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36), fontWeight: 600 }} title={member?.role ?? undefined}>
      {photo
        ? <img src={photo} alt="" width={size} height={size} loading="lazy" className="h-full w-full object-cover object-top" onError={() => setBroken(true)} />
        : initials(name)}
    </span>
  )
}
