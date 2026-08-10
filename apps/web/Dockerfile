FROM node:22-alpine AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/schemas/package.json packages/schemas/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --frozen-lockfile

COPY apps/web apps/web
COPY packages/schemas packages/schemas
COPY packages/ui packages/ui

# The production proxy keeps the browser and API on one origin, so the Vite
# client deliberately uses relative /api URLs.
ENV VITE_API_URL=
RUN pnpm --filter @opensession/web build

FROM caddy:2.10-alpine

COPY apps/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /workspace/apps/web/dist /srv

EXPOSE 80 443
