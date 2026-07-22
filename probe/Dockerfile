FROM node:22-slim
WORKDIR /app
COPY voightxyz-nosana-0.1.0.tgz probe.mjs ./
RUN npm install --no-fund --no-audit ./voightxyz-nosana-0.1.0.tgz
CMD ["node", "probe.mjs"]
