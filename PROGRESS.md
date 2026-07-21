# Nosana Grant Progress

Working log for the **Voight × Nosana grant** ($5,000 total, $2,000 in Nosana compute credits). Each part gets logged here as it ships so the thread is never lost — same pattern as the Agents and Bitfrost build logs.

## Milestone 1 — $1,000

| # | Deliverable | Status |
| :-: | --- | :-: |
| 1 | **Auto-detection of `NOSANA_JOB_ID`** for agents running on Nosana GPUs | ✅ shipped |
| 2 | **Correlating GPU usage with on-chain activity** | ⏳ next |
| 3 | **"Nosana-Powered" badge** in the Voight public explorer + registration in the **Agentic Registry** | ⏳ pending |

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

## Reference

- Grant deliverables (Milestone 1): SDK auto-detection · GPU↔on-chain correlation · explorer badge + Agentic Registry.
- Nosana credits available for testing: $2,000 (use for live end-to-end validation on a real GPU job — planned as the acceptance test of Part 1+2 together).
- Source-of-truth files consulted: `nosana-ci/nosana-cli` → `src/services/NodeManager/provider/Provider.ts`, `src/services/NodeManager/node/job/jobHandler.ts`.
- After this grant: back to **observability** (Voight's pillar).
