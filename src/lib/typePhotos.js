// A picture for each type of work, from the company's own projects on
// cdelectrical.co.nz/projects — so the type-of-work chart shows the kind of
// job, the way the Employee KPI shows the person. 768px versions, which is
// plenty for a thumbnail. A type with no photo shows its initials.
const U = 'https://www.cdelectrical.co.nz/wp-content/uploads/'
export const TYPE_PHOTOS = {
  'Residential New Build': { photo: `${U}2024/12/IMG_6354-768x576.jpg`, project: 'Fitzgerald Ave / Chester St East' },
  'Residential Renovation': { photo: `${U}2025/04/Stairs-768x644.png`, project: 'Architectural new build, Cashmere' },
  'Residential Service': { photo: `${U}2024/11/uploads1715202201060-6bgnn2aulol-c76a6241ef84e850120e165b75daabcb1-360-Montreal-Street-21-scaled-1-768x512.jpg`, project: 'Cranmer Terraces' },
  'Commercial New Build': { photo: `${U}2024/12/AquaPro-768x552.jpg`, project: 'AquaPro' },
  'Commercial Renovation': { photo: `${U}2020/07/vapo-2-768x837.jpg`, project: 'Vapo, High St' },
  'Commercial Service': { photo: `${U}2020/07/Little-Fish-768x576.jpg`, project: 'Little Fish Co' },
  'Rest Homes': { photo: `${U}2021/09/SouthbaseOCHT9April2021-2955-2-4-768x511.jpg`, project: 'OCHT development' },
  'Solar': { photo: `${U}2024/11/1730243641654-768x512.jpeg`, project: 'University of Canterbury solar flower' },
  'Smart Vent': { photo: `${U}2024/12/IMG_5047-768x546.jpg`, project: 'Vi Block' },
  'E4M': { photo: `${U}2024/11/2acdcdd4-9d2c-4187-901b-111504c81b6b-768x512.jpg`, project: 'CoolTranz' },
  'Contract Labour': { photo: `${U}2025/08/1.png`, project: 'Kōawa Studios' },
  'Design': { photo: `${U}2019/03/007-Halswell-School-Jan-19--768x512.jpg`, project: 'Halswell School' },
  'Warranty': { photo: `${U}2021/09/Vapo-1-resized-768x576.jpg`, project: 'Vapo, Mt Maunganui' },
  'Sundry': { photo: `${U}2025/08/Koawa-Studio-Long.png`, project: 'Kōawa Studios' },
  'Lighter': { photo: `${U}2024/12/IMG_5047-768x546.jpg`, project: 'Vi Block' },
}
export const typePhoto = (type) => TYPE_PHOTOS[type] ?? null
