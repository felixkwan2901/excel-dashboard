// The things about a job that only a person knows — who to ring, how to get
// in, what will hurt you — and where they are stored.
//
// Constants and pure functions only, deliberately free of imports:
// scripts/__tests__ runs under plain node, which cannot resolve this
// project's extensionless Vite imports, and scripts/publish-field-jobs.mjs
// imports `toFieldJob` from here. The reading and writing lives in
// jobDetailsStore.js.
//
// None of this is in the workbook and none of it is in the Jobs export. The
// export gave an address and a one-line description; it has no phone number,
// no gate code and nothing about hazards. So this is typed, once, by whoever
// knows — and every field below already has a place waiting for it on the
// field app's job screen, which currently renders blank.

// Same reasoning as the owner and category blobs: one key holding every job's
// details rather than a key per job, because the Worker has no list endpoint
// and per-job keys could not be read back without already knowing every job
// number.
//
// This exact string has to be in the Worker's APP_DATA_KEY_RE allowlist
// (upload-worker/src/index.js AND site-worker/index.js) or every save is
// rejected with a 400.
export const JOB_DETAILS_KEY = 'planning:job-details'

// Every field is free text, including the ones that look like they want a
// type. "Induction" is not a checkbox because the real answer on site is
// "site office, ask for Dave" rather than yes or no, and a checkbox would
// have thrown that away. A phone number is not validated because +64,
// 021 and "Dave 0274 ... / after 4pm Sam 027 ..." are all things somebody
// will legitimately type, and rejecting the third would mean the number
// simply does not get recorded.
//
// `group` is the heading in the column-picker panel. `wide` widens the input
// for fields that hold a sentence rather than a word.
export const JOB_DETAIL_FIELDS = [
  {
    key: 'contactName',
    label: 'Site contact',
    group: 'Contact',
    placeholder: 'Name',
  },
  {
    key: 'contactRole',
    label: 'Contact role',
    group: 'Contact',
    placeholder: 'Site foreman',
  },
  {
    key: 'contactPhone',
    label: 'Contact phone',
    group: 'Contact',
    placeholder: '027 ...',
    tel: true,
  },
  {
    key: 'contactEmail',
    label: 'Contact email',
    group: 'Contact',
    placeholder: 'name@...',
    email: true,
  },
  {
    key: 'hazards',
    label: 'Hazards on site',
    group: 'Safety',
    placeholder: 'Live switchboard; asbestos in ceiling',
    wide: true,
  },
  {
    key: 'induction',
    label: 'Induction / sign in',
    group: 'Safety',
    placeholder: 'Site office, ask for Dave',
    wide: true,
  },
  {
    key: 'gateCode',
    label: 'Gate / key',
    group: 'Site',
    placeholder: 'Keybox 4821',
  },
  { key: 'parking', label: 'Parking', group: 'Site', placeholder: 'Rear yard off Restell St' },
  { key: 'hours', label: 'Site hours', group: 'Site', placeholder: '7am - 4pm, no weekends' },
  {
    key: 'switchboard',
    label: 'Switchboard',
    group: 'Work',
    placeholder: 'Plant room, level 1',
    wide: true,
  },
  { key: 'supply', label: 'Supply', group: 'Work', placeholder: '3 phase, 100A', wide: true },
]

export const JOB_DETAIL_KEYS = JOB_DETAIL_FIELDS.map((f) => f.key)

// Hazards are one column because that is what a spreadsheet-shaped table can
// offer, but the field app lists them one per row — so a semicolon or a new
// line splits them. Splitting on a comma as well was considered and dropped:
// "Live switchboard, isolated Tuesday" is one hazard, and breaking it in two
// would show a crew the word "isolated Tuesday" with no subject.
export function splitHazards(value) {
  return String(value ?? '')
    .split(/[;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

// Turn one job's typed details into the shape the field app already expects.
//
// This mapping lives here, next to the fields, rather than in the publish
// script: the dashboard decides what a column means, and a second copy of
// that decision in a script is how the column and the screen end up
// disagreeing. Returns only the keys that have a value, so publishing a job
// with nothing typed against it adds nothing at all rather than a row of
// empty strings the field screen would have to guard against.
export function toFieldJob(detail) {
  const get = (key) => String(detail?.[key] ?? '').trim()
  const out = {}

  const site = {}
  if (get('gateCode')) site.gateCode = get('gateCode')
  if (get('parking')) site.parking = get('parking')
  if (get('hours')) site.hours = get('hours')
  if (Object.keys(site).length) out.site = site

  // One contact, not a list, because one column can only ever hold one — but
  // the field app's shape is a list and stays a list, so a second contact
  // added later needs no change on that side. The role defaults rather than
  // being left blank: the field screen labels the row "<role> · <name>", and
  // an empty role there reads as a rendering fault.
  if (get('contactName') || get('contactPhone') || get('contactEmail')) {
    out.contacts = [
      {
        role: get('contactRole') || 'Site contact',
        name: get('contactName'),
        phone: get('contactPhone'),
        ...(get('contactEmail') ? { email: get('contactEmail') } : {}),
      },
    ]
  }

  const hazards = splitHazards(get('hazards'))
  if (hazards.length) out.hazards = hazards
  if (get('induction')) out.inductionRequired = get('induction')
  if (get('switchboard')) out.switchboardLocation = get('switchboard')
  if (get('supply')) out.supply = get('supply')

  return out
}
