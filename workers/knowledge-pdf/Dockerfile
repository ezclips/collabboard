# syntax=docker/dockerfile:1.7

FROM node:22.14.0-bookworm-slim AS build

ARG OPENDATALOADER_PDF_ZIP_URL=https://github.com/opendataloader-project/opendataloader-pdf/releases/download/v2.5.0/opendataloader-pdf-cli-2.5.0.zip
ARG OPENDATALOADER_PDF_ZIP_SHA256=738E0A85B8FA82599205F47EDE74DD76B0EDE99E5BC5998B73C5F92320E6DC6B
ARG OPENDATALOADER_PDF_JAR_SHA256=516CE47832A6726E87CB17DB77C20174CA8CABBE9A6B56DB1418BABC7C9DDCBA

WORKDIR /app

RUN apt-get update \
  && apt-get install --no-install-recommends -y ca-certificates curl unzip \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Bundle the application/worker code and Supabase client. PDF.js remains an
# explicit runtime dependency so its legacy Node build is loaded by the worker
# without pulling it into the Next.js bundle.
RUN mkdir -p /app/dist \
  && npx esbuild workers/knowledge-pdf/runDispatcher.ts \
       --bundle \
       --platform=node \
       --format=esm \
       --target=node22 \
       --external:pdfjs-dist/legacy/build/pdf.mjs \
       --outfile=/app/dist/runDispatcher.mjs

RUN mkdir -p /opt/opendataloader \
  && curl --fail --silent --show-error --location "$OPENDATALOADER_PDF_ZIP_URL" --output /tmp/opendataloader-pdf-cli-2.5.0.zip \
  && printf '%s  %s\n' "$OPENDATALOADER_PDF_ZIP_SHA256" /tmp/opendataloader-pdf-cli-2.5.0.zip | sha256sum --check --strict \
  && unzip -p /tmp/opendataloader-pdf-cli-2.5.0.zip opendataloader-pdf-cli-2.5.0.jar > /opt/opendataloader/opendataloader-pdf-cli-2.5.0.jar \
  && printf '%s  %s\n' "$OPENDATALOADER_PDF_JAR_SHA256" /opt/opendataloader/opendataloader-pdf-cli-2.5.0.jar | sha256sum --check --strict \
  && rm -f /tmp/opendataloader-pdf-cli-2.5.0.zip

FROM node:22.14.0-bookworm-slim AS runtime

ARG OPENDATALOADER_PDF_JAR_SHA256=516CE47832A6726E87CB17DB77C20174CA8CABBE9A6B56DB1418BABC7C9DDCBA

WORKDIR /app

RUN apt-get update \
  && apt-get install --no-install-recommends -y ca-certificates openjdk-17-jre-headless \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 10001 collabboard \
  && useradd --system --uid 10001 --gid 10001 --create-home --home-dir /home/collabboard collabboard \
  && mkdir -p /opt/opendataloader \
  && chown -R collabboard:collabboard /app /home/collabboard /opt/opendataloader

COPY --from=build /app/dist /app/dist
COPY --from=build /app/node_modules/pdfjs-dist /app/node_modules/pdfjs-dist
COPY --from=build /opt/opendataloader/opendataloader-pdf-cli-2.5.0.jar /opt/opendataloader/opendataloader-pdf-cli-2.5.0.jar

RUN printf '%s  %s\n' "$OPENDATALOADER_PDF_JAR_SHA256" /opt/opendataloader/opendataloader-pdf-cli-2.5.0.jar | sha256sum --check --strict \
  && node --version \
  && java -version

ENV NODE_ENV=production \
    TMPDIR=/tmp \
    OPENDATALOADER_JAVA_BIN=/usr/bin/java \
    OPENDATALOADER_JAR_PATH=/opt/opendataloader/opendataloader-pdf-cli-2.5.0.jar

USER collabboard

# Exec form keeps SIGTERM/SIGINT on the Node dispatcher process.
CMD ["node", "/app/dist/runDispatcher.mjs"]
