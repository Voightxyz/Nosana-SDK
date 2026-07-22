# Wiring the beacon into any framework

[`beacon.mjs`](beacon.mjs) is a framework-agnostic boot hook: run it once when
your agent starts, before or alongside your runtime. It detects the Nosana
job, correlates it on-chain, and reports to Voight — then gets out of the way.

**Any Node-based runtime** — chain it into your start command:

```json
{ "scripts": { "start": "node scripts/beacon.mjs || true; <your runtime start>" } }
```

**ElizaOS** — same pattern with the Eliza CLI (`VOIGHT_FRAMEWORK=elizaos`):

```json
{ "scripts": { "start": "node scripts/beacon.mjs || true; elizaos start --character ./characters/agent.character.json" } }
```

**Hermes / other containerized runtimes** — call the beacon from the
container's entrypoint before exec'ing the runtime (`VOIGHT_FRAMEWORK=hermes`).

Set `VOIGHT_API_KEY` (and optionally `VOIGHT_AGENT_LABEL`) in your Nosana job
definition's env. Remember job definitions are public on IPFS: use scoped,
revocable keys.
