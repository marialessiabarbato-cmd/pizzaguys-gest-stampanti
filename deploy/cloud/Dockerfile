FROM node:22-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/cloud-api/package.json apps/cloud-api/
COPY packages/db/package.json packages/db/
COPY packages/types/package.json packages/types/
COPY packages/validators/package.json packages/validators/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY apps/cloud-api apps/cloud-api
COPY packages packages
RUN pnpm --filter @pizzaguys/db build
RUN pnpm --filter @pizzaguys/cloud-api build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/cloud-api/dist ./apps/cloud-api/dist
COPY --from=build /app/apps/cloud-api/package.json ./apps/cloud-api/
COPY --from=build /app/packages ./packages
EXPOSE 4000
CMD ["node", "apps/cloud-api/dist/index.js"]
