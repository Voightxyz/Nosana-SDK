# Nosana Grant Progress

Working log for the **Voight × Nosana grant** ($5,000 total, $2,000 in Nosana compute credits). Each part gets logged here as it ships so the thread is never lost — same pattern as the Agents and Bitfrost build logs.

## Milestone 1 — $1,000

| # | Deliverable | Status |
| :-: | --- | :-: |
| 1 | **Auto-detection of `NOSANA_JOB_ID`** for agents running on Nosana GPUs | ✅ shipped |
| 2 | **Correlating GPU usage with on-chain activity** | ✅ shipped |
| 3 | **"Nosana-Powered" badge** in the Voight public explorer + registration in the **Agentic Registry** | ✅ shipped, live in prod |

---

## Log

### 2026-07-20 — Part 1: auto-detection (`@voightxyz/nosana`)

**Ground truth first.** Before writing the SDK we verified in the `nosana-ci/nosana-cli` source exactly what a Nosana node injects into every job container:

- `Provider.ts` (container/run env block): **`NOSANA_ID: flow.id`** is injected into every `container/run` operation, merged after the job definition's own env.
- `jobHandler.claim(jobAddress)` sets `this.id = jobAddress` — so **`flow.id` IS the on-chain job account address** (a base58 Solana pubkey).
- The gateway/frpc sidecar additionally receives `JOB_ID` (= same flow id) and `DEPLOYMENT_ID` (load-balanced deployments).

Two consequences worth stating:

1. The reliable variable inside the *agent's* container is **`NOSANA_ID`**. The SDK also accepts `NOSANA_JOB_ID` and `JOB_ID` so it keeps working if Nosana renames or a job definition passes them explicitly.
2. Because the detected id is the on-chain job account, **detection already gives us the anchor for Part 2** (on-chain correlation): the same id resolves on the Nosana dashboard (`dashboard.nosana.com/jobs/<id>`) and on Solana explorers.

**Shipped:**

- `@voightxyz/nosana` package (zero runtime dependencies, CJS + ESM + types):
  - `detectNosana(env?)` → `{ jobId, source, isAddress, dashboardUrl?, deploymentId? } | null`
  - `isRunningOnNosana(env?)` → boolean
  - `nosanaJobUrl(jobId)` → Nosana dashboard link
- Base58-pubkey validation (32–44 chars, Solana alphabet) gates `isAddress`/`dashboardUrl`, so a malformed env value can never produce a broken explorer link.
- Unit tests over the real injection shapes (NOSANA_ID, fallbacks, precedence, invalid values, deployment id).

**How it will be used (parts 2–3 preview):** an agent (or the Voight SDK inside it) calls `detectNosana()` at boot; when it returns a context, the agent's registration/events carry `nosana.jobId`, Voight's explorer shows the "Nosana-Powered" badge, and the Agentic Registry entry includes the job linkage.

---

### 2026-07-21 — Part 2: on-chain correlation

The detected `NOSANA_ID` is the address of a `JobAccount` owned by the Nosana Jobs program (`nosJhNRqr2bc9g1nfGDcXXTXvYUmxD4cVwy2pMWhrYM`). Part 2 reads it straight over Solana JSON-RPC with a hand-rolled decoder — still **zero runtime dependencies** (no web3.js, no anchor), so any agent can embed it.

**Layout ground truth:** `nosana-ci/nosana-programs` → `programs/nosana-jobs/src/state.rs` (`JobAccount`: ipfs_job, ipfs_result, market, node, payer, price, project, state, time_end, time_start, timeout) and `types.rs` (`JobState`: Queued=0, Done=2, Stopped=3). RUNNING is derived: claimed (`time_start > 0`) and unfinished (`time_end == 0`).

**Shipped:**

- `fetchNosanaJob(jobId)` → decoded `NosanaJobInfo`: derived state, GPU market, node, payer, project, price (raw + NOS), start/end times, timeout, and the **IPFS CIDv0s** for the job definition and result (reconstructed from the on-chain 32-byte digests), plus dashboard/Solscan URLs.
- `correlateNosana()` → detection + chain read in one call; never throws on RPC hiccups (an observability failure must not break the agent).
- `nosanaAttributes()` → flat, stable `nosana.*` attribute set (job_id, state, market, node, price_nos, started_at, ipfs_result, …) ready to merge into Voight observability events and agent registrations. This is the correlation surface Parts 3 consumes.
- 9 new tests (18 total): full layout decode, state mapping, RUNNING derivation, foreign-account rejection, RPC-failure resilience.

**Validated against mainnet, not just fixtures:** pulled a live job from recent program activity and decoded it with the built package — job `4iVwKBpPqaRSRt4EoBxL4ZjNbZGMM1ijPvUcb7FsyBuR` (QUEUED, market `31P9d5ah…`, 0.0003 NOS, 6h timeout), and its reconstructed `ipfsJobCid` (`QmPUhY3h…`) **resolves on Nosana's IPFS gateway to the actual job definition JSON**. Detection → chain → content, end to end.

**Next (Part 3):** Voight API stores the `nosana.*` context at agent registration → public explorer renders the "Nosana-Powered" badge (linked to the job for independent verification) → Agentic Registry entry carries the Nosana linkage.

---

### 2026-07-21 — Part 3: "Nosana-Powered" badge + Agentic Registry (live in production)

The Voight platform side, deployed to production at voight.xyz / api.voight.xyz:

- **Ingest.** When an observed agent's events carry the `nosana.*` attributes this SDK emits, Voight lazily stamps `metadata.nosana` on the agent — one idempotent JSONB merge guarded on jobId, fire-and-forget, so correlation can never slow down or break event ingestion. Dashboard URLs are validated against `dashboard.nosana.com` before being stored (nothing arbitrary ever renders in the public explorer).
- **Public explorer.** Agents running on Nosana show a Nosana-green **"Nosana-Powered"** badge on their explorer card and profile; the profile badge links straight to the Nosana job dashboard so anyone can verify the GPU workload on-chain. The ecosystem stats endpoint (`/v1/stats`) now reports `nosanaPowered`, and the agents list accepts a `nosana=true` filter.
- **Agentic Registry.** Nosana-powered agents get registered in the MPL Agent Registry (Metaplex) with Voight's registry keypair: a public `agent_uri` endpoint (`/v1/registry/observed/:id`) serves their metadata JSON including the Nosana job linkage, and the minted asset address lands on the agent's record. Registration runs as an idempotent operational script (dry-run by default), reusing the same mint path as Voight's worker-agent registry (active on mainnet since July 15).

**Verified in production:** `/v1/stats` serves `nosanaPowered` and the `registry/observed` route responds. The counter reads 0 today for an honest reason: no deployed agent emits the attributes yet — closing the loop live is the acceptance test below.

**Acceptance test (next, uses the $2,000 Nosana credits):** deploy a real agent on a Nosana GPU with `@voightxyz/nosana` inside, watch detection → correlation → badge → registry happen end to end, and record the job + asset addresses here.

---

### 2026-07-22 — ACCEPTANCE TEST PASSED: the full loop, live on a real Nosana GPU

A probe container (`probe/`, image `docker.io/seenfinity/voight-nosana-probe`) was deployed as a real Nosana GPU job using the grant's compute credits. Every link in the chain fired, with independently verifiable artifacts:

| Step | Evidence |
| --- | --- |
| Nosana GPU job | [`96zb2aU1VjCEsnZHDX8GCtzLk5afVFGrQjPPxKva7YMp`](https://dashboard.nosana.com/jobs/96zb2aU1VjCEsnZHDX8GCtzLk5afVFGrQjPPxKva7YMp) (market `7AtiXMSH…`, job definition pinned at `QmZPu3Qq…`) |
| Detection inside the container | job logs print the `NOSANA_ID` context detected by the SDK |
| Observability event → Voight | agent **nosana-probe** ([`cmrw2pnli2txzjktriyp92kov`](https://voight.xyz/agent/cmrw2pnli2txzjktriyp92kov)) created with `metadata.nosana` stamped at ingest |
| Explorer badge | **Nosana-Powered** renders live on the public profile; ecosystem stats report `nosanaPowered: 1` |
| Agentic Registry | MPL Core asset [`CfAWScgEEcDFujo1B8VxTMT9yxqByW8LfEAGTKUFeq5z`](https://www.metaplex.com/agents/CfAWScgEEcDFujo1B8VxTMT9yxqByW8LfEAGTKUFeq5z) minted on mainnet, `agent_uri` → `/v1/registry/observed/cmrw2pnli2txzjktriyp92kov` carrying the job linkage |

Two operational findings, logged for honesty:

1. **In-container RPC**: the probe's own on-chain read returned null inside the node (the public mainnet RPC is not reliably reachable from Nosana nodes). The SDK's fail-open design meant detection and the event still flowed, and Voight's server-side read of the same account covered the correlation. Recommendation for embedders: set `NOSANA_RPC_URL` to a dedicated RPC for in-container reads, or rely on server-side enrichment.
2. **Job definitions are public on IPFS**: any env var in the definition (like an ingest API key) is world-readable. Use scoped, revocable keys and rotate them after a run.

Milestone 1 is complete end to end: all three deliverables shipped and proven live.

---

### 2026-07-21 — Housekeeping: README + repo polish, npm status

- README expanded into a full SDK reference: quickstart, end-to-end flow diagram, complete API/attribute tables, environment reference with source-grounded detection notes, and the Voight integration section. Repo description + topics set.
- **npm status:** `@voightxyz/nosana` is **not published yet** (deliberately deferred). Parts 1 and 2 both live in this package, so the first `npm publish --access public` ships everything at once; Part 3 lives in the Voight platform and never touches npm. Nothing is pending besides that single publish.

---

## Reference

- Grant deliverables (Milestone 1): SDK auto-detection · GPU↔on-chain correlation · explorer badge + Agentic Registry.
- Nosana credits available for testing: $2,000 (use for live end-to-end validation on a real GPU job — planned as the acceptance test of Part 1+2 together).
- Source-of-truth files consulted: `nosana-ci/nosana-cli` → `src/services/NodeManager/provider/Provider.ts`, `src/services/NodeManager/node/job/jobHandler.ts`.
- After this grant: back to **observability** (Voight's pillar).
