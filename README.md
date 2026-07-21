# @voightxyz/nosana

**Voight × Nosana SDK.** Detect, from inside the container, that an AI agent is running on a [Nosana](https://nosana.com) GPU job, and link it to its **on-chain job account** on Solana.

Built for the Voight × Nosana grant. Progress log: [PROGRESS.md](PROGRESS.md).

## Install

```bash
npm install @voightxyz/nosana
```

## Use

```ts
import { detectNosana, isRunningOnNosana } from '@voightxyz/nosana'

const nosana = detectNosana()
if (nosana) {
  // Running on a Nosana GPU.
  console.log(nosana.jobId)        // on-chain job account (base58)
  console.log(nosana.dashboardUrl) // https://dashboard.nosana.com/jobs/<jobId>
}
```

Zero runtime dependencies. CJS + ESM + TypeScript types.

## How detection works

A Nosana node injects **`NOSANA_ID`** into every `container/run` operation of a job, and its value is the job's **on-chain account address** (verified against the [`nosana-ci/nosana-cli`](https://github.com/nosana-ci/nosana-cli) source: the container env merge in `Provider.ts`, and `jobHandler.claim()` which sets the flow id to the claimed job address). The SDK also honors `NOSANA_JOB_ID` and `JOB_ID` as fallbacks, and carries `DEPLOYMENT_ID` for load-balanced deployments.

Because the detected id **is** the on-chain account, the same value that flags "this agent runs on Nosana" also anchors it to Solana: no extra lookup needed to correlate GPU workloads with on-chain activity.

## API

| Export | Returns |
| --- | --- |
| `detectNosana(env?)` | `NosanaContext \| null` — `{ jobId, source, isAddress, dashboardUrl?, deploymentId? }` |
| `isRunningOnNosana(env?)` | `boolean` |
| `nosanaJobUrl(jobId)` | Nosana dashboard URL for a job |

## Development

```bash
npm install
npm test        # node:test suite
npm run build   # tsup → dist (esm + cjs + d.ts)
```

## License

MIT © Galaxyhub Labs Inc. d/b/a Voight
