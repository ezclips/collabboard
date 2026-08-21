# syntax=docker/dockerfile:1.7

FROM node:22.14.0-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN mkdir -p /app/dist \
  && npx esbuild workers/knowledge-embedding/cli.ts \
       --bundle \
       --platform=node \
       --format=esm \
       --target=node22 \
       --outfile=/app/dist/knowledgeEmbeddingWorker.mjs

FROM node:22.14.0-bookworm-slim AS runtime

WORKDIR /app

RUN apt-get update \
  && apt-get install --no-install-recommends -y ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 10001 collabboard \
  && useradd --system --uid 10001 --gid 10001 --create-home --home-dir /home/collabboard collabboard \
  && chown -R collabboard:collabboard /app /home/collabboard

COPY --from=build /app/dist /app/dist

ENV NODE_ENV=production

USER collabboard

CMD ["node", "/app/dist/knowledgeEmbeddingWorker.mjs"]
