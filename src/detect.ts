/**
 * Nosana job auto-detection.
 *
 * A Nosana node injects `NOSANA_ID` into every `container/run` operation of a
 * job, and its value is the job's ON-CHAIN account address (base58 Solana
 * pubkey) — verified in nosana-ci/nosana-cli: Provider.ts merges
 * `NOSANA_ID: flow.id` into the container env, and jobHandler.claim() sets the
 * flow id to the claimed job address. The gateway sidecar additionally carries
 * `JOB_ID` and `DEPLOYMENT_ID` for load-balanced deployments, so both are
 * honored here as fallbacks/extras.
 */

/** Where the job id was found, in precedence order. */
export type NosanaIdSource = 'NOSANA_ID' | 'NOSANA_JOB_ID' | 'JOB_ID'

export interface NosanaContext {
  /** The Nosana job id. When `isAddress` is true this is the on-chain job account. */
  jobId: string
  /** Env var the id came from. */
  source: NosanaIdSource
  /** True when the id parses as a base58 Solana pubkey (32-44 chars). */
  isAddress: boolean
  /** Nosana dashboard link for the job — only set when `isAddress` is true. */
  dashboardUrl?: string
  /** Deployment id when the job runs behind Nosana's load balancer. */
  deploymentId?: string
}

const ID_VARS: NosanaIdSource[] = ['NOSANA_ID', 'NOSANA_JOB_ID', 'JOB_ID']

// Base58 (Bitcoin alphabet) at Solana pubkey lengths. Deliberately strict: a
// value that fails this still *detects* (the env var is the signal we are on
// Nosana) but never produces an explorer link.
const BASE58_PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

export function nosanaJobUrl(jobId: string): string {
  return `https://dashboard.nosana.com/jobs/${jobId}`
}

/**
 * Detect whether this process runs inside a Nosana job. Returns the job
 * context, or null when no Nosana id variable is present (e.g. local dev,
 * other clouds). Reads `process.env` unless an env object is passed.
 */
export function detectNosana(env: NodeJS.ProcessEnv = process.env): NosanaContext | null {
  for (const source of ID_VARS) {
    const raw = env[source]?.trim()
    if (!raw) continue
    const isAddress = BASE58_PUBKEY_RE.test(raw)
    const deploymentId = env.DEPLOYMENT_ID?.trim() || undefined
    return {
      jobId: raw,
      source,
      isAddress,
      ...(isAddress ? { dashboardUrl: nosanaJobUrl(raw) } : {}),
      ...(deploymentId ? { deploymentId } : {}),
    }
  }
  return null
}

/** True when the process runs inside a Nosana job container. */
export function isRunningOnNosana(env: NodeJS.ProcessEnv = process.env): boolean {
  return detectNosana(env) !== null
}
