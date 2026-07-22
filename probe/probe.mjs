/**
 * Nosana acceptance probe.
 *
 * Runs INSIDE a Nosana GPU job and exercises the whole chain live:
 * detection → on-chain correlation → one observability event to Voight
 * carrying the nosana.* attributes. Everything it finds is printed to the
 * job logs, so the run documents itself on the Nosana dashboard.
 */
import { correlateNosana, nosanaAttributes } from '@voightxyz/nosana'

const AGENT_LABEL = process.env.VOIGHT_AGENT_LABEL ?? 'nosana-probe'
const INGEST_URL = process.env.VOIGHT_INGEST_URL ?? 'https://api.voight.xyz/v1/events'
const LINGER_MS = Number(process.env.PROBE_LINGER_MS ?? 90_000)

console.log('[probe] Voight × Nosana acceptance probe')
console.log('[probe] NOSANA_ID =', process.env.NOSANA_ID ?? '(not set)')

const correlation = await correlateNosana()
if (!correlation) {
  console.log('[probe] no Nosana job detected in this environment — exiting')
  process.exit(1)
}

console.log('[probe] detection:', JSON.stringify(correlation.context))
console.log('[probe] on-chain job:', JSON.stringify(correlation.job, null, 2))

const attrs = nosanaAttributes(correlation)
console.log('[probe] attributes:', JSON.stringify(attrs, null, 2))

const apiKey = process.env.VOIGHT_API_KEY
if (!apiKey) {
  console.log('[probe] VOIGHT_API_KEY not set — detection verified, skipping ingest')
  process.exit(0)
}

const res = await fetch(INGEST_URL, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
  body: JSON.stringify({
    agentId: AGENT_LABEL,
    type: 'action',
    outcome: 'success',
    reasoning:
      'Acceptance probe: agent running on a Nosana GPU job, detected and correlated on-chain by @voightxyz/nosana.',
    metadata: { source: 'nosana-probe', ...attrs },
  }),
})
console.log('[probe] voight ingest →', res.status, await res.text())

// Stay up briefly so the job is observable as RUNNING, then finish cleanly.
// A short run means the probe costs cents of credit, not dollars.
await new Promise((resolve) => setTimeout(resolve, LINGER_MS))
console.log('[probe] done')
