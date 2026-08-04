import auditLogUrl from '../../audit-log.json?url'
import { getSessionId } from './sessionId'

const AUDIT_ENDPOINT = 'https://cde-data-upload.fkw24.workers.dev/audit-log'

export async function loadAuditLog() {
  try {
    const res = await fetch(auditLogUrl)
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

// Fire-and-forget: the local UI already reflects the status change via the
// approval override, so a failed or slow write here shouldn't block or
// roll that back. The entry is committed server-side (Worker + GitHub),
// which takes a build/deploy cycle to show up for a freshly-loaded page —
// callers should merge in their own optimistic copy in the meantime.
export function recordApprovalChange({ jobId, previousStatus, newStatus }) {
  fetch(AUDIT_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId, previousStatus, newStatus, session: getSessionId() }),
  }).catch(() => {
    // Best-effort — nothing to recover here.
  })
}
