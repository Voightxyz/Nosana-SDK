/**
 * Nosana agent scanner — read-only discovery of AI agents running on Nosana.
 *
 * Everything it reads is public: recent activity of the Nosana Jobs program on
 * Solana, the job accounts (decoded with @voightxyz/nosana), and each job's
 * definition pinned on IPFS. From the definition's image/command/env it
 * classifies the workload as an AI agent, plain GPU infra (model servers,
 * image gen, training), or unknown — and groups agent jobs into agent
 * identities (same project + image, or the same deployment).
 *
 * This tool writes NOTHING anywhere. It is the discovery half of the pipeline;
 * feeding discovered agents into an explorer is a separate, deliberate step.
 *
 * Usage:
 *   node indexer/scan.mjs              # scan recent activity (default 60 txs)
 *   SCAN_TXS=150 node indexer/scan.mjs # scan deeper
 *   NOSANA_RPC_URL=… node indexer/scan.mjs
 */

import { decodeJobAccount, NOSANA_JOBS_PROGRAM } from '../dist/index.js'

const RPC = process.env.NOSANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com'
const IPFS_GATEWAY = process.env.NOSANA_IPFS_GATEWAY ?? 'https://nosana.mypinata.cloud/ipfs/'
const SCAN_TXS = Number(process.env.SCAN_TXS ?? 60)

const AGENT_PATTERNS = [
  /eliza/i, /agent-challenge/i, /mastra/i, /langgraph/i, /crewai/i, /autogen/i,
  /langchain/i, /superagent/i, /nosship/i, /agentkit/i, /\bagent\b/i,
]
const INFRA_PATTERNS = [
  /vllm/i, /ollama/i, /comfy/i, /stable-?diffusion/i, /text-generation-inference/i,
  /\btgi\b/i, /sglang/i, /lmdeploy/i, /whisper/i, /kobold/i, /sogni/i,
  /pytorch\/pytorch/i, /tensorflow\/tensorflow/i, /jupyter/i, /automatic1111/i,
  /folding@?home/i, /foldingathome/i, /boinc/i,
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function rpc(method, params) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const body = await res.json()
  if (body.error) throw new Error(`${method}: ${body.error.message}`)
  return body.result
}

/** Fetch + decode a job account; null when it isn't a JobAccount. */
async function tryJob(address) {
  const value = (await rpc('getAccountInfo', [address, { encoding: 'base64' }]))?.value
  if (!value || value.owner !== NOSANA_JOBS_PROGRAM) return null
  try {
    return decodeJobAccount(address, Uint8Array.from(Buffer.from(value.data[0], 'base64')))
  } catch {
    return null // wrong discriminator (market/run account) or malformed
  }
}

function classify(def) {
  const ops = Array.isArray(def?.ops) ? def.ops : []
  const haystacks = []
  for (const op of ops) {
    const a = op?.args ?? {}
    haystacks.push(String(a.image ?? ''))
    haystacks.push(Array.isArray(a.cmd) ? a.cmd.join(' ') : String(a.cmd ?? ''))
    haystacks.push(Object.keys(a.env ?? {}).join(' '))
  }
  const text = haystacks.join(' ')
  if (AGENT_PATTERNS.some((p) => p.test(text))) return 'agent'
  if (INFRA_PATTERNS.some((p) => p.test(text))) return 'infra'
  return 'unknown'
}

function frameworkOf(text) {
  if (/eliza|nosship/i.test(text)) return 'elizaos'
  if (/mastra|agent-challenge/i.test(text)) return 'mastra'
  if (/langgraph|langchain/i.test(text)) return 'langgraph'
  if (/crewai/i.test(text)) return 'crewai'
  if (/hermes/i.test(text)) return 'hermes'
  return 'unknown'
}

// ── scan ─────────────────────────────────────────────────────────────────────
console.log(`scanning last ${SCAN_TXS} transactions of the Nosana Jobs program…`)
const sigs = await rpc('getSignaturesForAddress', [NOSANA_JOBS_PROGRAM, { limit: SCAN_TXS }])

const seen = new Set()
const jobs = []
for (const s of sigs) {
  if (s.err) continue
  const tx = await rpc('getTransaction', [s.signature, { encoding: 'json', maxSupportedTransactionVersion: 0 }]).catch(() => null)
  await sleep(120) // stay friendly with the public RPC
  const keys = tx?.transaction?.message?.accountKeys ?? []
  for (const key of keys) {
    if (seen.has(key)) continue
    seen.add(key)
    const job = await tryJob(key).catch(() => null)
    await sleep(120)
    if (job) jobs.push(job)
  }
}
console.log(`found ${jobs.length} job accounts in recent activity`)

// Pull each unique job definition from IPFS and classify.
const agents = new Map() // key: project + image → agent identity
const counters = { agent: 0, infra: 0, unknown: 0, noDefinition: 0 }
const samples = { infra: new Set(), unknown: new Set() }
for (const job of jobs) {
  if (!job.ipfsJobCid) {
    counters.noDefinition++
    continue
  }
  const def = await fetch(IPFS_GATEWAY + job.ipfsJobCid, { signal: AbortSignal.timeout(15000) })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
  if (!def) {
    counters.noDefinition++
    continue
  }
  const kind = classify(def)
  counters[kind]++
  if (kind !== 'agent') {
    const img = def.ops?.[0]?.args?.image
    if (img && samples[kind]) samples[kind].add(img)
    continue
  }

  const image = def.ops?.[0]?.args?.image ?? 'unknown-image'
  const key = def.deployment_id ?? `${job.project}::${image}`
  const existing = agents.get(key)
  if (existing) {
    existing.jobs.push(job.address)
  } else {
    agents.set(key, {
      framework: frameworkOf(image + ' ' + JSON.stringify(def.ops?.[0]?.args?.env ?? {})),
      image,
      project: job.project,
      deploymentId: def.deployment_id ?? null,
      state: job.state,
      market: job.market,
      lastJob: job.address,
      dashboardUrl: job.dashboardUrl,
      jobs: [job.address],
    })
  }
}

// ── report ───────────────────────────────────────────────────────────────────
console.log('')
console.log(`AI AGENTS DISCOVERED: ${agents.size}`)
for (const a of agents.values()) {
  console.log('')
  console.log(`  framework: ${a.framework}`)
  console.log(`  image:     ${a.image}`)
  console.log(`  owner:     ${a.project}`)
  console.log(`  jobs seen: ${a.jobs.length} (latest ${a.state})`)
  console.log(`  verify:    ${a.dashboardUrl}`)
}
console.log('')
console.log(
  `classified as GPU infra (model servers, image gen, …): ${counters.infra} · unknown (skipped, conservative): ${counters.unknown} · no definition reachable: ${counters.noDefinition}`,
)
if (samples.infra.size) console.log('  infra images:  ', [...samples.infra].slice(0, 8).join(' · '))
if (samples.unknown.size) console.log('  unknown images:', [...samples.unknown].slice(0, 8).join(' · '))
console.log('read-only scan — nothing was written anywhere.')
