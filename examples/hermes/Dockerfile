# Hermes agent + Voight × Nosana beacon. The base is a Hermes agent runtime
# image (Node 22 included); the layer adds the SDK and a boot wrapper that
# detects the Nosana job and reports it to Voight before the gateway starts.
ARG HERMES_IMAGE=us-central1-docker.pkg.dev/voight-agents/agents/hermes-agent:amd64
FROM ${HERMES_IMAGE}
WORKDIR /opt/voight
COPY voightxyz-nosana-0.1.0.tgz beacon.mjs start.sh ./
RUN npm install --no-fund --no-audit ./voightxyz-nosana-0.1.0.tgz && chmod +x start.sh
ENTRYPOINT ["/opt/voight/start.sh"]
