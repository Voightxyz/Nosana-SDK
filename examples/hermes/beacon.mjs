/**
 * Voight × Nosana boot beacon for a Hermes agent.
 * Runs once before the hermes gateway starts: detects the Nosana job,
 * correlates it on-chain, and sends one attributed observability event to
 * Voight. Never blocks or breaks the agent: any failure just logs and exits 0.
 */
try {
  const { correlateNosana, nosanaAttributes } = await import('@voightxyz/nosana')
  const c = await correlateNosana()
  if (!c) {
    console.log('[voight-nosana] not running on Nosana — beacon idle')
  } else {
    console.log('[voight-nosana] Nosana job detected:', c.context.jobId)
    if (c.job) console.log('[voight-nosana] on-chain state:', c.job.state, '| market:', c.job.market)
    const key = process.env.VOIGHT_API_KEY
    if (!key) {
      console.log('[voight-nosana] VOIGHT_API_KEY not set — skipping ingest')
    } else {
      const res = await fetch(process.env.VOIGHT_INGEST_URL ?? 'https://api.voight.xyz/v1/events', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({
          agentId: process.env.VOIGHT_AGENT_LABEL ?? 'Hermes on Nosana',
          type: 'action',
          outcome: 'success',
          reasoning: 'Hermes agent booted on a Nosana GPU job, detected and correlated by @voightxyz/nosana.',
          metadata: { tool: 'hermes', source: 'hermes-nosana', ...nosanaAttributes(c) },
        }),
      })
      console.log('[voight-nosana] voight ingest →', res.status)
    }
  }
} catch (err) {
  console.log('[voight-nosana] beacon skipped:', err.message)
}
process.exit(0)
