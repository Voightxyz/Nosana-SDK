#!/bin/sh
# Hermes on Nosana: bake a minimal config + soul, fire the Voight × Nosana
# beacon, then hand the process over to the hermes gateway.
mkdir -p /opt/data
cat > /opt/data/config.yaml <<CFG
model:
  default: "${HERMES_MODEL:-z-ai/glm-4.6}"
  provider: openrouter
  base_url: https://openrouter.ai/api/v1
web:
  search_backend: ddgs
platform_toolsets:
  api_server: [terminal, file, web, todo, skills, memory]
approvals:
  mode: "off"
CFG
cat > /opt/data/SOUL.md <<SOUL
# Identity
You are Hermes on Nosana: a Voight worker agent running on Nosana's
decentralized GPU network. Your job is proven on-chain: the Nosana job that
runs you is a Solana account anyone can verify, and Voight's explorer shows
you as Nosana-Powered.

# Style
Direct and substantive. Honest about uncertainty.
SOUL
export HOME=/opt/data HERMES_HOME=/opt/data PORT="${PORT:-8642}"
# Ephemeral single-run job: accept the image's root-gateway escape hatch,
# the same way the managed Cloud Run path executes this image.
export HERMES_ALLOW_ROOT_GATEWAY=1
cd /opt/data
node /opt/voight/beacon.mjs || true
exec /opt/hermes/.venv/bin/hermes gateway run --no-supervise --quiet
