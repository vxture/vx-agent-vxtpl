# syntax=docker/dockerfile:1.7
# Multi-stage build for the Next.js standalone app in a pnpm workspace.
# Build context = repo root (so the workspace and lockfile are visible).
# Produces the single owned image vxtpl-app.

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable

# --- deps + build ---
FROM base AS builder
WORKDIR /repo
COPY . .
# The GitHub Packages token (for @vxture/*, e.g. @vxture/shared - TD-001) rides
# a BuildKit secret, read via .npmrc's ${NODE_AUTH_TOKEN} - never a build-arg,
# never baked into a layer. Required: the app depends on @vxture/shared.
ARG VXTURE_NPM_REGISTRY
RUN --mount=type=secret,id=node_auth_token \
    --mount=type=cache,id=pnpm,target=/pnpm/store \
    NODE_AUTH_TOKEN="$(cat /run/secrets/node_auth_token 2>/dev/null || true)" \
    pnpm install --frozen-lockfile
RUN pnpm --filter @vxtpl/app build

# --- runner (Next standalone, non-root, never migrates) ---
FROM base AS runner
WORKDIR /app
# Build provenance (025 section 4.1): honest ARG defaults so an un-injected build
# still reports truthfully (dev/unknown), never a fabricated version. Read at
# RUNTIME by the liveness route - server-side env, NOT NEXT_PUBLIC (stays out of
# the client bundle). HOSTNAME=0.0.0.0 keeps loopback healthchecks reachable
# (020 section 3: Next standalone otherwise binds the container ID only).
ARG APP_VERSION=dev
ARG GIT_SHA=unknown
ARG BUILD_TIME=unknown
ARG DEPLOY_STAGE=dev
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 \
    APP_VERSION=${APP_VERSION} \
    GIT_SHA=${GIT_SHA} \
    BUILD_TIME=${BUILD_TIME} \
    DEPLOY_STAGE=${DEPLOY_STAGE}
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
COPY --from=builder /repo/portals/app/.next/standalone ./
COPY --from=builder /repo/portals/app/.next/static ./portals/app/.next/static
COPY --from=builder /repo/portals/app/public ./portals/app/public
USER nextjs
EXPOSE 3000
CMD ["node", "portals/app/server.js"]
