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

// The mapping from these columns into the field app's shape used to live
// here and was applied by publish-field-jobs.mjs. It has moved to the field
// app (cde-field/src/lib/jobDetails.js), which now reads this blob live —
// so a number typed in the table is on a crew's phone the next time they
// open the app, with no command to run.
//
// The key names above are the contract between the two repos. Both sides
// have tests asserting the same shape, so a rename that breaks the pair
// fails a test instead of quietly emptying a screen.
