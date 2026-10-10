# syntax=docker/dockerfile:1
# Genlib ship template (Apache-2.0). Adoption required: read templates/ship/README.md.
# Node.js server image: locked install, separate build stage, non-root runtime.
# Replace NODE_VERSION, the build/start scripts, PORT and the health path with the
# application's real values. Pin the base image by digest after verifying it.

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

FROM deps AS build
COPY . .
# Must be a real build script; remove this stage only when the app has no build step.
RUN npm run build
RUN npm prune --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
# Copy only the build output the server needs; adjust "dist" to the real output directory.
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 3000
# Uses Node's built-in fetch, so the slim image needs no curl. Point it at a real
# liveness endpoint (for example the health-checks module's /healthz handler).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "dist/server.js"]
