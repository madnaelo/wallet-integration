FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS build
WORKDIR /app
COPY services/market-radar/package.json services/market-radar/package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.radar.json ./
COPY src/market-radar ./src/market-radar
RUN ./node_modules/.bin/tsc -p tsconfig.radar.json

FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS runtime-deps
WORKDIR /app
COPY services/market-radar/package.json services/market-radar/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV RADAR_MODE=disabled
ENV RADAR_BIND_ADDRESS=0.0.0.0
ENV NODE_OPTIONS=--max-old-space-size=256
RUN apk upgrade --no-cache libcrypto3 libssl3 \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-v1.22.22 \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
COPY --from=runtime-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.market-radar ./dist
COPY --chown=node:node scripts/provision-radar-role.mjs ./provision-radar-role.mjs
USER node
EXPOSE 8092
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD node -e "fetch('http://127.0.0.1:8092/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
