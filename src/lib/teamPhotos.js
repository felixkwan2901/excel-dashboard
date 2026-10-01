// Who is who: each person on cdelectrical.co.nz/meet-the-team, with their
// role and photo, so a name on the Employee KPI page has a face beside it.
// Hotlinked from the company site (one place to keep in sync); a missing or
// failed photo falls back to initials, never a broken image. Matched on
// first name, which is how the timesheets name people — a first name that
// is not on this list simply gets initials.
const U = 'https://www.cdelectrical.co.nz/wp-content/uploads/'
export const TEAM = {
  hayden: { role: 'Electrician', photo: `${U}2025/11/IMG-20251021-WA0004-225x300.jpg` },
  cameron: { role: 'Team Leader — Commercial', photo: `${U}2025/01/36131282-0e99-4eee-97b9-b305f56b5127-242x300.jpg` },
  ethan: { role: 'Apprentice Electrician', photo: `${U}2025/11/IMG-20251104-WA0003-225x300.jpg` },
  jack: { role: 'Electrician', photo: `${U}2025/11/IMG-20251021-WA0010-225x300.jpg` },
  jasper: { role: 'Apprentice Electrician', photo: `${U}2024/08/IMG_5071-220x300.png` },
  josh: { role: 'Business Development Manager', photo: `${U}2025/11/IMG-20251021-WA0003-225x300.jpg` },
  andy: { role: 'Electrician', photo: `${U}2026/02/Andy-1-240x300.png` },
  nick: { role: 'Senior Estimator', photo: `${U}2024/06/IMG_5131-224x300.png` },
  kyle: { role: 'Electrician', photo: `${U}2024/12/dcb241fe-8617-4768-aedb-ebdff436a6e4-238x300.jpg` },
  dylan: { role: 'Operations Manager', photo: `${U}2024/08/IMG_5113-238x300.png` },
  charlie: { role: 'Apprentice Electrician', photo: `${U}2025/11/IMG-20251104-WA0002-225x300.jpg` },
  sean: { role: 'Electrician', photo: `${U}2024/06/IMG_5078-235x300.png` },
  ranjith: { role: 'Junior Estimator', photo: `${U}2024/08/IMG_5122-227x300.png` },
  dan: { role: 'Electrician', photo: `${U}2017/10/Dan-website-photo-205x300.jpg` },
  quin: { role: 'Apprentice Electrician', photo: `${U}2025/11/IMG-20251102-WA0001-225x300.jpg` },
  logan: { role: 'Apprentice Electrician', photo: `${U}2024/06/IMG_5099-231x300.png` },
  holly: { role: 'Marketing Co-ordinator', photo: `${U}2017/10/Holly-Website-Photo-225x300.jpg` },
  regan: { role: 'Apprentice Electrician', photo: `${U}2025/11/IMG-20251021-WA0011-225x300.jpg` },
  doug: { role: 'Electrician', photo: `${U}2024/08/IMG_5087-220x300.png` },
  caleb: { role: 'Junior Estimator', photo: `${U}2025/12/WhatsApp-Image-2025-11-27-at-11.30.37_8b9d4baa-e1764627901959-253x300.jpg` },
  george: { role: 'Apprentice Electrician', photo: `${U}2024/08/IMG_5074-222x300.png` },
  tom: { role: 'Team Leader — Residential', photo: `${U}2024/09/164eedc7-c818-4f04-a9e9-4737b27e93dd-224x300.jpg` },
  rhod: { role: 'Apprentice Electrician' },          // the site shows a placeholder for Rhod
  tim: { role: 'General Manager', photo: `${U}2024/08/IMG_5110-230x300.jpg` },
  viv: { role: 'Office Manager', photo: `${U}2024/08/IMG_5093-235x300.png` },
  jacob: { role: 'Electrician' },                    // no photo of his own on the site yet
}

export function teamMember(fullName) {
  const first = String(fullName ?? '').trim().split(/\s+/)[0]?.toLowerCase()
  return (first && TEAM[first]) ?? null
}

export const initials = (fullName) => String(fullName ?? '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
