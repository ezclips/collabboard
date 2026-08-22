# Local semantic retrieval benchmark

This is an isolated CPU-only benchmark for the three-document CollabBoard
chunk-shaped proof. It does not import application code, access Supabase, call
OpenAI/Voyage hosted APIs, or touch user PDFs.

The official local model conventions used by the harness are:

- `voyageai/voyage-4-nano`: Sentence Transformers `encode_query` and
  `encode_document`, with `truncate_dim=1024`.
- `Qwen/Qwen3-Embedding-0.6B`: Sentence Transformers `prompt_name="query"`
  for queries and unprompted document encoding, at its 1024-dimensional
  output.

Both official model cards identify Apache-2.0 licensing. Weights are cached by
the local Hugging Face tooling and are not repository artifacts.

```powershell
py -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python run_benchmark.py --self-test
.\.venv\Scripts\python run_benchmark.py --model voyage
.\.venv\Scripts\python run_benchmark.py --model qwen
# Run the final arm with --heading-prefix only on the measured winner.
```
