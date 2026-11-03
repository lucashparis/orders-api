FROM node:24.22.2-alpine3.24 AS base
RUN apk add --no-cache openssl
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json .npmrc ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM deps AS verify
COPY . .
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npm run generate \
  && npm run typecheck

FROM base AS runtime
COPY package.json package-lock.json .npmrc ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --omit=optional
COPY --from=verify /app/src ./src
COPY --from=verify /app/prisma ./prisma
COPY --from=verify /app/prisma.config.ts ./prisma.config.ts
ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["node", "src/server.ts"]
