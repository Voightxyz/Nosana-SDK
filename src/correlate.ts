/**
 * Detection + on-chain read, composed — and the flat attribute set an agent
 * (or the Voight SDK) attaches to its observability events so GPU usage is
 * correlated with on-chain activity per event.
 */

import { detectNosana, type NosanaContext } from './detect.js'
import { fetchNosanaJob, type FetchNosanaJobOptions, type NosanaJobInfo } from './onchain.js'

export interface NosanaCorrelation {
  context: NosanaContext
  /** Null when the account isn't on chain (yet) or the id isn't an address. */
  job: NosanaJobInfo | null
}

/**
 * One call for agents: am I on Nosana, and what does the chain say about my
 * job? Returns null when not running on Nosana. Never throws for on-chain
 * hiccups — a correlation failure must not break the agent; the context still
 * comes back with `job: null`.
 */
export async function correlateNosana(
  opts: FetchNosanaJobOptions & { env?: NodeJS.ProcessEnv } = {},
): Promise<NosanaCorrelation | null> {
  const context = detectNosana(opts.env ?? process.env)
  if (!context) return null
  if (!context.isAddress) return { context, job: null }
  try {
    const job = await fetchNosanaJob(context.jobId, opts)
    return { context, job }
  } catch {
    return { context, job: null }
  }
}

/**
 * Flatten a correlation into event attributes (string/number values only),
 * ready to merge into observability events, agent registrations, or logs.
 * Keys are stable and namespaced under `nosana.`.
 */
export function nosanaAttributes(c: NosanaCorrelation): Record<string, string | number> {
  const attrs: Record<string, string | number> = {
    'nosana.job_id': c.context.jobId,
    'nosana.source': c.context.source,
  }
  if (c.context.deploymentId) attrs['nosana.deployment_id'] = c.context.deploymentId
  if (c.context.dashboardUrl) attrs['nosana.dashboard_url'] = c.context.dashboardUrl
  const job = c.job
  if (job) {
    attrs['nosana.state'] = job.state
    attrs['nosana.market'] = job.market
    attrs['nosana.project'] = job.project
    attrs['nosana.price_nos'] = job.priceNos
    if (job.node) attrs['nosana.node'] = job.node
    if (job.timeStart) attrs['nosana.started_at'] = job.timeStart
    if (job.timeEnd) attrs['nosana.ended_at'] = job.timeEnd
    if (job.ipfsJobCid) attrs['nosana.ipfs_job'] = job.ipfsJobCid
    if (job.ipfsResultCid) attrs['nosana.ipfs_result'] = job.ipfsResultCid
  }
  return attrs
}
