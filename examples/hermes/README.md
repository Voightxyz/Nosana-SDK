# Hermes adapter — a full agent runtime on a Nosana GPU

Runs a Hermes worker agent on a Nosana GPU job with the Voight × Nosana beacon
wired in. This is the exact image behind the live "Hermes on Nosana" agent in
the Voight explorer.

- [`beacon.mjs`](beacon.mjs): boot beacon — detect, correlate, report to Voight.
- [`start.sh`](start.sh): bakes a minimal config + soul, fires the beacon, then
  hands the process to the hermes gateway.
- [`Dockerfile`](Dockerfile): layers the SDK + wrapper over a Hermes runtime image.
- [`job-definition.json`](job-definition.json): post this on the Nosana
  dashboard. Fill `VOIGHT_API_KEY`; `OPENROUTER_API_KEY` is only needed if you
  want to chat with the agent — use a spending-capped key, because job
  definitions are public on IPFS.

```bash
docker build -t you/hermes-nosana .
docker push you/hermes-nosana
# then deploy job-definition.json at dashboard.nosana.com
```
