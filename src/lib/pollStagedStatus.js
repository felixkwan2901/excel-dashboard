import { workerFetch } from './workerClient'

// The upload worker only stages requests (commits them under
// pending-updates/) — a GitHub Actions workflow does the actual Excel
// processing afterward, since that needs real CPU time Cloudflare's free
// plan doesn't give per-request. This polls /status for a staged path
// until the workflow has picked it up and finished (file gone from
// pending-updates/, and not in pending-updates/failed/ either) or failed
// (moved to failed/ with a reason), or the timeout is reached.
export async function pollStagedStatus(path, { intervalMs = 4000, timeoutMs = 180000 } = {}) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await workerFetch(`/status?path=${encodeURIComponent(path)}`, {
        headers: { Accept: 'application/json' },
      })
      const payload = await res.json()
      if (payload.status === 'done' || payload.status === 'failed') return payload
    } catch {
      // Transient network hiccup — just try again next interval.
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  return { status: 'timeout' }
}
