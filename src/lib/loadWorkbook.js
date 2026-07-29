import * as XLSX from 'xlsx'
import workbookUrl from '../../Cassidy_Davies_Electrical_BPMN_Data.xlsx?url'

const JOB_HEADERS = [
  'jobId',
  'client',
  'category',
  'createdAt',
  'swimlane',
  'aiStatus',
  'approvalStatus',
  'tech',
  'value',
  'processId',
]

const MATRIX_HEADERS = [
  'number',
  'role',
  'elementType',
  'responsibilities',
  'integrationPoint',
]

function sheetRows(sheet) {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' })
}

function rowsAfterHeader(rows, headerMatch, headerKeys) {
  const headerIdx = rows.findIndex((row) => row[0] === headerMatch)
  if (headerIdx === -1) return []
  const out = []
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row[0]) break
    const record = {}
    headerKeys.forEach((key, col) => {
      record[key] = row[col] ?? ''
    })
    out.push(record)
  }
  return out
}

export async function loadWorkbook() {
  const buffer = await fetch(workbookUrl).then((res) => res.arrayBuffer())
  const workbook = XLSX.read(buffer, { type: 'array' })

  const jobRows = sheetRows(workbook.Sheets['Job Directory'])
  const jobs = rowsAfterHeader(jobRows, 'Job ID', JOB_HEADERS).map((job) => ({
    ...job,
    value: Number(job.value) || 0,
  }))

  const matrixRows = sheetRows(workbook.Sheets['Swimlane Reference'])
  const swimlaneReference = rowsAfterHeader(matrixRows, 'Swimlane #', MATRIX_HEADERS)

  return { jobs, swimlaneReference }
}
