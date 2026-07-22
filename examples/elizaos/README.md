# ElizaOS integration

The same boot-beacon pattern used by the [Hermes adapter](../hermes/), applied
to an ElizaOS project: run the beacon before the runtime starts, so the agent
reports its Nosana job to Voight on boot.

1. Add the SDK to your Eliza project:

```bash
npm install @voightxyz/nosana
```

2. Copy [`beacon.mjs`](../hermes/beacon.mjs) into your project's `scripts/`
   folder and set `metadata.tool` to `elizaos` inside it.

3. Chain it into your start script (never blocks, never breaks the agent):

```json
{
  "scripts": {
    "start": "node scripts/beacon.mjs || true; elizaos start --character ./characters/agent.character.json"
  }
}
```

4. Deploy on Nosana with `VOIGHT_API_KEY` (and optionally
   `VOIGHT_AGENT_LABEL`) in the job definition's env. Detection, the
   explorer badge, and the registry linkage follow automatically.
