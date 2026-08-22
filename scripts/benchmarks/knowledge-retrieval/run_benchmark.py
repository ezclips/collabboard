from __future__ import annotations

import argparse
import json
import os
import sys
import threading
import time
from dataclasses import dataclass
from pathlib import Path


DIMENSIONS = 1024
TASK = "Given a query, retrieve the CollabBoard passage that best answers it"


@dataclass(frozen=True)
class Chunk:
    chunk_id: str
    document_id: str
    page: int
    text: str
    heading_path: tuple[str, ...]
    locator: dict[str, object]


@dataclass(frozen=True)
class Query:
    query_id: str
    text: str
    expected_chunk: str | None
    expected_document: str | None
    expected_page: int | None


def make_locator(document_id: str, page: int, ordinal: int) -> dict[str, object]:
    return {
        "pageNumber": page,
        "sourceElementId": f"{document_id}-element-{ordinal}",
        "elementType": "paragraph",
        "readingOrder": ordinal,
        "space": "pdf-points-bottom-left",
        "bbox": {"left": 72, "bottom": 100 + ordinal * 20, "right": 540, "top": 118 + ordinal * 20},
    }


def corpus() -> tuple[Chunk, ...]:
    return (
        Chunk("ordinary-p1", "ordinary-prose", 1, "A calm shared workspace benefits from quiet focus blocks, visible availability signals, and short written handoffs. Teams reduce interruptions by grouping notifications, recording decisions in one place, and making the next owner explicit. These habits preserve concentration without hiding urgent work.", (), make_locator("ordinary-prose", 1, 1)),
        Chunk("ordinary-p2", "ordinary-prose", 2, "Before changing a shared workspace setting, record the current value, identify who depends on it, and make one reversible change. Review the result after a short observation period. A small change log makes later troubleshooting faster and keeps routine collaboration predictable.", (), make_locator("ordinary-prose", 2, 1)),
        Chunk("manual-p1", "structured-manual", 1, "Operations Manual\n1. Intake and triage\nNew work is assigned an owner, an impact level, and a review time. Numbered intake records should preserve the original request and link to the decision that closes it.", ("Operations Manual", "1. Intake and triage"), make_locator("structured-manual", 1, 1)),
        Chunk("manual-p2", "structured-manual", 2, "Operations Manual\n2. Recovery\n2.1 Restore a workspace\nTo recover a failed workspace, pause new changes, restore the last known good snapshot, verify permissions, and announce the recovery result.\n2.2 Verify completion\nA recovery is complete only after a reader can open the workspace and the owner confirms the expected content.", ("Operations Manual", "2. Recovery", "2.1 Restore a workspace"), make_locator("structured-manual", 2, 2)),
        Chunk("manual-p3", "structured-manual", 3, "Operations Manual\n3. Review\nAfter recovery, compare the change log with the restored snapshot and record unresolved follow-up work. Do not silently overwrite an uncertain result.", ("Operations Manual", "3. Review"), make_locator("structured-manual", 3, 1)),
        Chunk("appendix-p1", "appendix-reference", 1, "Appendix A — terminology\nThe term retention means how long an export remains available. Review status means whether an owner has checked the export. These are separate labels: a retained item may still be awaiting review, and a reviewed item may later expire.", ("Appendix A — terminology",), make_locator("appendix-reference", 1, 1)),
        Chunk("appendix-p2", "appendix-reference", 2, "Appendix B — archive table\nItem | Storage class | Retention | Review status\nMeeting export | warm | 30 days | reviewed\nAudit bundle | cold | 365 days | awaiting review\nThe table is a lookup aid; retention and review status must not be treated as the same field.", ("Appendix B — archive table",), make_locator("appendix-reference", 2, 1)),
    )


def queries() -> tuple[Query, ...]:
    return (
        Query("q01", "How can a team protect concentration while still handling urgent collaboration?", "ordinary-p1", "ordinary-prose", 1),
        Query("q02", "What should be checked before changing a shared workspace option?", "ordinary-p2", "ordinary-prose", 2),
        Query("q03", "Where are the numbered instructions for bringing a failed workspace back online?", "manual-p2", "structured-manual", 2),
        Query("q04", "What does section 2.1 require when restoring a workspace?", "manual-p2", "structured-manual", 2),
        Query("q05", "How does an operator know that recovery is actually complete?", "manual-p2", "structured-manual", 2),
        Query("q06", "Which appendix row keeps an audit bundle for a year?", "appendix-p2", "appendix-reference", 2),
        Query("q07", "What is the distinction between how long an export stays available and whether someone reviewed it?", "appendix-p1", "appendix-reference", 1),
        Query("q08", "In the archive lookup, which item is still waiting for review?", "appendix-p2", "appendix-reference", 2),
        Query("q09", "How should a team tune a quantum telescope for lunar telemetry?", None, None, None),
        Query("q10", "What ingredients and oven temperature are required for sourdough bread?", None, None, None),
        Query("q11", "What steps return an unavailable shared workspace to a usable state?", "manual-p2", "structured-manual", 2),
        Query("q12", "How can a collaboration change remain reversible and easy to troubleshoot?", "ordinary-p2", "ordinary-prose", 2),
    )


class PeakRss:
    def __init__(self) -> None:
        self.process = None
        self.peak = 0
        self.stop = threading.Event()
        self.thread: threading.Thread | None = None

    def __enter__(self) -> "PeakRss":
        import psutil
        self.process = psutil.Process()

        def sample() -> None:
            while not self.stop.is_set():
                self.peak = max(self.peak, self.process.memory_info().rss)
                self.stop.wait(0.05)

        self.thread = threading.Thread(target=sample, daemon=True)
        self.thread.start()
        return self

    def __exit__(self, *_: object) -> None:
        self.stop.set()
        if self.thread:
            self.thread.join(timeout=1)
        if self.process:
            self.peak = max(self.peak, self.process.memory_info().rss)


def folder_size(path: Path) -> int:
    return sum(item.stat().st_size for item in path.rglob("*") if item.is_file())


def self_test() -> None:
    items = corpus()
    fixed_queries = queries()
    assert len({item.document_id for item in items}) == 3
    assert len(fixed_queries) == 12
    assert all(1 <= item.page for item in items)
    assert all(len(item.text) <= 2_000 for item in items)
    assert all(item.locator["pageNumber"] == item.page for item in items)
    assert sum(query.expected_chunk is None for query in fixed_queries) >= 2
    print(json.dumps({"status": "self-test-pass", "chunks": len(items), "queries": len(fixed_queries), "documents": 3}))


def load_model(model_name: str):
    from huggingface_hub import snapshot_download
    from sentence_transformers import SentenceTransformer

    repo = "voyageai/voyage-4-nano" if model_name == "voyage" else "Qwen/Qwen3-Embedding-0.6B"
    download_started = time.perf_counter()
    local_path = Path(__file__).parent / ".models" / model_name
    local_path.parent.mkdir(parents=True, exist_ok=True)
    snapshot_download(repo, local_dir=local_path, local_dir_use_symlinks=False)
    download_seconds = time.perf_counter() - download_started
    load_started = time.perf_counter()
    with PeakRss() as rss:
        if model_name == "voyage":
            model = SentenceTransformer(str(local_path), trust_remote_code=True, truncate_dim=DIMENSIONS, device="cpu")
        else:
            model = SentenceTransformer(str(local_path), device="cpu")
    load_seconds = time.perf_counter() - load_started
    return model, local_path, download_seconds, load_seconds, rss.peak


def encode_documents(model_name: str, model, texts: list[str]):
    kwargs = {"batch_size": 2, "normalize_embeddings": True, "convert_to_numpy": True, "show_progress_bar": False}
    if model_name == "voyage":
        return model.encode_document(texts, truncate_dim=DIMENSIONS, **kwargs)
    return model.encode(texts, **kwargs)


def encode_query(model_name: str, model, text: str):
    if model_name == "voyage":
        result = model.encode_query(text, truncate_dim=DIMENSIONS, normalize_embeddings=True, convert_to_numpy=True, show_progress_bar=False)
        return result[0] if getattr(result, "ndim", 1) > 1 else result
    return model.encode([text], prompt_name="query", normalize_embeddings=True, convert_to_numpy=True, show_progress_bar=False)[0]


def benchmark(model_name: str, heading_prefix: bool) -> dict[str, object]:
    import numpy as np
    import torch

    torch.set_num_threads(min(8, os.cpu_count() or 1))
    items = corpus()
    fixed_queries = queries()
    model, local_path, download_seconds, load_seconds, peak_rss = load_model(model_name)
    texts = [((" > ".join(item.heading_path) + "\n") if heading_prefix and item.heading_path else "") + item.text for item in items]
    corpus_started = time.perf_counter()
    document_vectors = encode_documents(model_name, model, texts)
    corpus_seconds = time.perf_counter() - corpus_started
    rows: list[dict[str, object]] = []
    for query in fixed_queries:
        started = time.perf_counter()
        query_vector = encode_query(model_name, model, query.text)
        scores = np.asarray(document_vectors) @ np.asarray(query_vector)
        order = np.argsort(-scores)
        elapsed = time.perf_counter() - started
        ranked = [{"chunk_id": items[index].chunk_id, "score": float(scores[index]), "document_id": items[index].document_id, "page": items[index].page} for index in order]
        top = ranked[0]
        rows.append({
            "query_id": query.query_id,
            "expected_chunk": query.expected_chunk,
            "rank1_chunk": top["chunk_id"],
            "rank1_score": top["score"],
            "rank1_document": top["document_id"],
            "rank1_page": top["page"],
            "rank1_correct": top["chunk_id"] == query.expected_chunk if query.expected_chunk else None,
            "top5_correct": any(row["chunk_id"] == query.expected_chunk for row in ranked[:5]) if query.expected_chunk else None,
            "latency_seconds": elapsed,
            "top5": ranked[:5],
        })
    positives = [row for row in rows if row["expected_chunk"]]
    negatives = [row for row in rows if not row["expected_chunk"]]
    return {
        "model": model_name,
        "heading_prefix": heading_prefix,
        "dimensions": DIMENSIONS,
        "chunks": len(items),
        "queries": len(fixed_queries),
        "rank1_correct": sum(bool(row["rank1_correct"]) for row in positives),
        "top5_correct": sum(bool(row["top5_correct"]) for row in positives),
        "correct_document_rank1": sum(row["rank1_document"] == next(q.expected_document for q in fixed_queries if q.query_id == row["query_id"]) for row in positives),
        "correct_page_rank1": sum(row["rank1_page"] == next(q.expected_page for q in fixed_queries if q.query_id == row["query_id"]) for row in positives),
        "negative_top_scores": [{"query_id": row["query_id"], "score": row["rank1_score"], "chunk_id": row["rank1_chunk"]} for row in negatives],
        "model_load_seconds": load_seconds,
        "download_seconds": download_seconds,
        "corpus_embed_seconds": corpus_seconds,
        "avg_query_latency_seconds": sum(float(row["latency_seconds"]) for row in rows) / len(rows),
        "peak_rss_mb": peak_rss / (1024 * 1024),
        "model_disk_mb": folder_size(local_path) / (1024 * 1024),
        "locator_checks": sum(items_by_id(items)[row["rank1_chunk"]].locator["pageNumber"] == row["rank1_page"] for row in positives if row["rank1_correct"]),
        "rows": rows,
    }


def items_by_id(items: tuple[Chunk, ...]) -> dict[str, Chunk]:
    return {item.chunk_id: item for item in items}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", choices=["voyage", "qwen"])
    parser.add_argument("--heading-prefix", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    if not args.model:
        parser.error("--model is required unless --self-test is used")
    print(json.dumps(benchmark(args.model, args.heading_prefix), indent=2))


if __name__ == "__main__":
    main()
