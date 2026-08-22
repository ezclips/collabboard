# syntax=docker/dockerfile:1.7

ARG TEI_IMAGE=ghcr.io/huggingface/text-embeddings-inference@sha256:ad950d30878eceb72aaf32024d26fa2b1d04a75304fa0b4776b49aa1941fea07
ARG VOYAGE_MODEL_REVISION=67fabc9bef010dabc5f6024aa1b1b6b93410426f

FROM python:3.12-slim-bookworm AS model

ARG VOYAGE_MODEL_REVISION
ENV HF_HOME=/tmp/huggingface

RUN pip install --no-cache-dir huggingface_hub==0.34.4
RUN python -c "from huggingface_hub import snapshot_download; snapshot_download(repo_id='voyageai/voyage-4-nano', revision='${VOYAGE_MODEL_REVISION}', local_dir='/model')"

FROM ${TEI_IMAGE}

ARG VOYAGE_MODEL_REVISION
LABEL org.opencontainers.image.source="https://huggingface.co/voyageai/voyage-4-nano" \
      org.opencontainers.image.revision="${VOYAGE_MODEL_REVISION}" \
      org.opencontainers.image.model="voyageai/voyage-4-nano"

COPY --from=model /model /model

ENV HF_HUB_OFFLINE=1 \
    HF_DATASETS_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1 \
    HF_HOME=/model

EXPOSE 8080

CMD ["--model-id", "/model", "--port", "8080", "--max-batch-tokens", "4096", "--max-concurrent-requests", "8", "--max-client-batch-size", "8", "--tokenization-workers", "2"]
