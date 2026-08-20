# PDF extraction worker feasibility prototype

This directory is isolated prototype tooling. It is not imported by the
Next.js application and is not production worker infrastructure.

The prototype uses only deterministic local PDFs generated with the existing
`jspdf` dependency. It does not install or download OpenDataLoader, Java,
Docker images, or OCR models.

## Generate the fixture corpus

```text
node tools/pdf-extraction-prototype/generate-fixtures.mjs --out tools/pdf-extraction-prototype/.artifacts/fixtures
```

The generator creates four local PDFs:

- `simple-text.pdf` — headings, paragraphs, and two pages.
- `two-column.pdf` — deliberately interleaved-looking two-column content.
- `table.pdf` — heading, table, and text above/below it.
- `mixed-layout.pdf` — heading, paragraphs, list, figure placeholder, and caption.

Generated files remain under `.artifacts/` and are ignored by Git.

## Run the native benchmark

The benchmark requires a Java 11+ executable and a locally supplied
OpenDataLoader CLI JAR. It intentionally does not enable hybrid, AI, or OCR
mode.

```text
npx --no-install vite-node tools/pdf-extraction-prototype/run-benchmark.ts \
  --fixtures tools/pdf-extraction-prototype/.artifacts/fixtures \
  --jar C:\path\to\opendataloader-pdf-cli.jar \
  --out tools/pdf-extraction-prototype/.artifacts/benchmark
```

The runner captures exit status, elapsed wall time, stdout/stderr, raw JSON,
raw Markdown when emitted, normalized P1 output, and a deterministic semantic
repeat comparison. It exits nonzero and reports the minimal missing runtime
when Java or the JAR is unavailable.

Page geometry is deliberately not invented. The benchmark therefore records
whether the P1 result is citation-ready, but does not implement geometry
enrichment.
