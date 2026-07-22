/**
 * Voight × Nosana boot beacon — framework-agnostic.
 *
 * Run this once when your agent starts (any runtime that can execute Node):
 * it detects the Nosana job the agent runs in, correlates it on-chain, and
 * sends one attributed observability event to Voight. It never blocks and
 * never breaks the agent: any failure logs and exits 0.
 *
 * Env: VOIGHT_API_KEY (required to report), VOIGHT_AGENT_LABEL (optional
 * display name), VOIGHT_FRAMEWORK (optional: elizaos | hermes | openclaw | …).
 */
try {
  const { correlateNosana, nosanaAttributes } = await import('@voightxyz/nosana')
  const c = await correlateNosana()
  if (!c) {
    console.log('[voight-nosana] not running on Nosana — beacon idle')
  } else {
    console.log('[voight-nosana] Nosana job detected:', c.context.jobId)
    const key = process.env.VOIGHT_API_KEY
    if (!key) {
      console.log('[voight-nosana] VOIGHT_API_KEY not set — skipping ingest')
    } else {
      const res = await fetch(process.env.VOIGHT_INGEST_URL ?? 'https://api.voight.xyz/v1/events', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({
          agentId: process.env.VOIGHT_AGENT_LABEL ?? 'nosana-agent',
          type: 'action',
          outcome: 'success',
          reasoning: 'Agent booted on a Nosana GPU job, detected and correlated by @voightxyz/nosana.',
          metadata: {
            ...(process.env.VOIGHT_FRAMEWORK ? { tool: process.env.VOIGHT_FRAMEWORK } : {}),
            source: 'nosana-beacon',
            ...nosanaAttributes(c),
          },
        }),
      })
      console.log('[voight-nosana] voight ingest →', res.status)
    }
  }
} catch (err) {
  console.log('[voight-nosana] beacon skipped:', err.message)
}
process.exit(0)
