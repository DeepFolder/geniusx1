FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM dependencies AS build
COPY . .
ARG APP_BUILD_SHA=unknown
ARG APP_BUILD_DATE=unknown
RUN printf '%s' "$APP_BUILD_SHA" > .build-sha \
    && printf '%s' "$APP_BUILD_DATE" > .build-date \
    && npm run build

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev --no-audit --no-fund

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=5000
ENV HOST=0.0.0.0
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates dumb-init ghostscript graphicsmagick \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/.build-sha /app/.build-date ./
COPY --from=build /app/attached_assets ./attached_assets
COPY --from=build /app/coming-soon ./coming-soon
COPY scripts/run.mjs ./scripts/run.mjs
RUN mkdir -p /app/uploads && chown node:node /app/uploads
USER node
EXPOSE 5000
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "scripts/run.mjs", "production"]
