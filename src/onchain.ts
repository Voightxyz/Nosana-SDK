/**
 * On-chain correlation (grant part 2).
 *
 * The detected `NOSANA_ID` IS the address of a `JobAccount` owned by the
 * Nosana Jobs program. This module reads that account over plain Solana
 * JSON-RPC and decodes it with a hand-rolled reader — no web3.js, no anchor,
 * zero runtime dependencies, so agents can embed it freely.
 *
 * Layout source of truth: nosana-ci/nosana-programs
 * `programs/nosana-jobs/src/state.rs` (JobAccount) and `types.rs` (JobState).
 * Anchor account = 8-byte discriminator + borsh fields in declaration order:
 *
 *   offset   8  ipfs_job    [u8;32]
 *   offset  40  ipfs_result [u8;32]   (all-zero = no result yet)
 *   offset  72  market      Pubkey
 *   offset 104  node        Pubkey    (all-zero while queued)
 *   offset 136  payer       Pubkey
 *   offset 168  price       u64 LE    (NOS, 6 decimals)
 *   offset 176  project     Pubkey
 *   offset 208  state       u8        (Queued=0, Done=2, Stopped=3)
 *   offset 209  time_end    i64 LE    (unix seconds, 0 = still going)
 *   offset 217  time_start  i64 LE    (unix seconds, 0 = not claimed yet)
 *   offset 225  timeout     i64 LE    (seconds)
 */

export const NOSANA_JOBS_PROGRAM = 'nosJhNRqr2bc9g1nfGDcXXTXvYUmxD4cVwy2pMWhrYM'
const DEFAULT_RPC = 'https://api.mainnet-beta.solana.com'
const JOB_ACCOUNT_MIN_SIZE = 233

export type NosanaJobState = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'STOPPED' | 'UNKNOWN'

export interface NosanaJobInfo {
  /** The job account address (= the detected NOSANA_ID). */
  address: string
  /** Derived state: the raw byte, plus RUNNING inferred from a claimed, unfinished job. */
  state: NosanaJobState
  stateRaw: number
  /** GPU market the job was posted to. */
  market: string
  /** Node running (or having run) the job — null while the job is still queued. */
  node: string | null
  payer: string
  project: string
  /** Price in raw units (u64, NOS has 6 decimals) and in NOS. */
  priceRaw: string
  priceNos: number
  /** Unix seconds — null when not started / not finished. */
  timeStart: number | null
  timeEnd: number | null
  timeoutSeconds: number
  /** IPFS CIDv0 of the job definition / result — result is null until posted. */
  ipfsJobCid: string | null
  ipfsResultCid: string | null
  dashboardUrl: string
  explorerUrl: string
}

export interface FetchNosanaJobOptions {
  /** Solana RPC endpoint. Defaults to NOSANA_RPC_URL / SOLANA_RPC_URL env, then mainnet public RPC. */
  rpcUrl?: string
  /** Injectable fetch (tests). */
  fetch?: typeof fetch
}

// ── base58 (Bitcoin alphabet) — encode only, enough for pubkeys + CIDs ──────
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

function base58Encode(bytes: Uint8Array): string {
  let n = 0n
  for (const b of bytes) n = (n << 8n) | BigInt(b)
  let out = ''
  while (n > 0n) {
    out = B58[Number(n % 58n)] + out
    n /= 58n
  }
  for (const b of bytes) {
    if (b !== 0) break
    out = '1' + out
  }
  return out
}

const ZERO32 = new Uint8Array(32)

function isZero(bytes: Uint8Array): boolean {
  return bytes.every((b) => b === 0)
}

function pubkeyAt(data: Uint8Array, offset: number): string {
  return base58Encode(data.subarray(offset, offset + 32))
}

/** [u8;32] sha256 digest → IPFS CIDv0 (0x12 0x20 prefix, base58btc). */
function ipfsCidAt(data: Uint8Array, offset: number): string | null {
  const digest = data.subarray(offset, offset + 32)
  if (isZero(digest)) return null
  const bytes = new Uint8Array(34)
  bytes[0] = 0x12
  bytes[1] = 0x20
  bytes.set(digest, 2)
  return base58Encode(bytes)
}

/** Decode a raw JobAccount buffer (including the 8-byte discriminator). */
export function decodeJobAccount(address: string, data: Uint8Array): NosanaJobInfo {
  if (data.length < JOB_ACCOUNT_MIN_SIZE) {
    throw new Error(`job account too small: ${data.length} < ${JOB_ACCOUNT_MIN_SIZE} bytes`)
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const stateRaw = data[208]!
  const timeEnd = Number(view.getBigInt64(209, true))
  const timeStart = Number(view.getBigInt64(217, true))
  const timeout = Number(view.getBigInt64(225, true))
  const priceRaw = view.getBigUint64(168, true)
  const nodeBytes = data.subarray(104, 136)

  let state: NosanaJobState
  if (stateRaw === 2) state = 'COMPLETED'
  else if (stateRaw === 3) state = 'STOPPED'
  else if (stateRaw === 0 || stateRaw === 1) state = timeStart > 0 && timeEnd === 0 ? 'RUNNING' : 'QUEUED'
  else state = 'UNKNOWN'

  return {
    address,
    state,
    stateRaw,
    market: pubkeyAt(data, 72),
    node: isZero(nodeBytes) ? null : base58Encode(nodeBytes),
    payer: pubkeyAt(data, 136),
    project: pubkeyAt(data, 176),
    priceRaw: priceRaw.toString(),
    priceNos: Number(priceRaw) / 1_000_000,
    timeStart: timeStart > 0 ? timeStart : null,
    timeEnd: timeEnd > 0 ? timeEnd : null,
    timeoutSeconds: timeout,
    ipfsJobCid: ipfsCidAt(data, 8),
    ipfsResultCid: ipfsCidAt(data, 40),
    dashboardUrl: `https://dashboard.nosana.com/jobs/${address}`,
    explorerUrl: `https://solscan.io/account/${address}`,
  }
}

/**
 * Fetch and decode the on-chain job account for a detected Nosana job.
 * Returns null when the account doesn't exist (wrong id, or pruned).
 * Throws on transport errors so callers can retry.
 */
export async function fetchNosanaJob(
  jobId: string,
  opts: FetchNosanaJobOptions = {},
): Promise<NosanaJobInfo | null> {
  const rpcUrl =
    opts.rpcUrl ?? process.env.NOSANA_RPC_URL?.trim() ?? process.env.SOLANA_RPC_URL?.trim() ?? DEFAULT_RPC
  const doFetch = opts.fetch ?? fetch
  const res = await doFetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getAccountInfo',
      params: [jobId, { encoding: 'base64' }],
    }),
  })
  if (!res.ok) throw new Error(`rpc ${rpcUrl} responded ${res.status}`)
  const body = (await res.json()) as {
    error?: { message?: string }
    result?: { value: { data: [string, string]; owner: string } | null }
  }
  if (body.error) throw new Error(`rpc error: ${body.error.message ?? 'unknown'}`)
  const value = body.result?.value
  if (!value) return null
  if (value.owner !== NOSANA_JOBS_PROGRAM) {
    throw new Error(`account ${jobId} is not a Nosana job (owner ${value.owner})`)
  }
  const data = Uint8Array.from(Buffer.from(value.data[0], 'base64'))
  return decodeJobAccount(jobId, data)
}
