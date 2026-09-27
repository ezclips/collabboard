# Ideas from Unstract (Prompt Studio, LLMWhisperer)

Status: IDEAS ONLY. Nothing here is specified or authorised. Each item needs an owner decision and
its own PATCH spec before any code.
Recorded: 2026-09-27, after the owner tried the LLMWhisperer playground with `Audi_A2_tire_big.pdf`.

Sources:
- Prompt Studio: https://docs.unstract.com/unstract/unstract_platform/features/prompt_studio/prompt_studio_intro/
- Output Analyzer: https://docs.unstract.com/unstract/unstract_platform/features/prompt_studio/output_analyzer/
- LLMWhisperer modes: https://docs.unstract.com/llmwhisperer/llm_whisperer/llm_whisperer_modes/
- Playground: https://playground.llmwhisperer.unstract.com/#playground

## What Unstract is

A document-extraction product. **LLMWhisperer** turns PDFs, scans and Office files into text laid
out the way the page is, so an LLM can read it. **Prompt Studio** lets a user write the fields they
want in plain language, run them over sample documents, compare LLMs, and deploy the result as an
API.

## Usable ideas, most useful first

### 1. Reusable extraction templates

**Theirs:** a project is a list of fields, each a plain-language prompt ("invoice number", "due
date") with an output type. The same list runs over every document. "Single-pass extraction"
answers every field in one LLM call to cut cost. "Combined output" merges the answers into one
JSON document.

**For us:** we already build a table from one document (table-from-document). A saved template
("tire size", "rim size", "model year") could run over several PDFs on a board, giving one row per
document. Every cell would link to its source page, reusing the Source · p. N citations. One call
per document is a single, predictable AI credit charge.

**Open questions:** where a template lives (board or workspace); what a cell shows when the answer
is not in the document; how its credit cost is shown before a run.

### 2. The page and its extracted text side by side

**Theirs:** the Output Analyzer shows the extracted output on one side and the original page on
the other, plus how many fields were filled.

**For us:** the reader already switches between the page image and the parsed text. Showing both at
once would make extraction mistakes visible: a mangled table, missing lines, text in the wrong
order. This matters most for documents that are tables, like the tire-size list.

### 3. Text that keeps the page layout

**Theirs:** the `layout_preserving` mode keeps columns and spacing, so a table stays a table in the
text the LLM reads. Their playground output for the tire PDF kept every size on its own line.

**For us:** first measure what our extraction does to multi-column pages and tables, using the
retrieval rating battery, before changing anything. If rows or columns get mixed up, layout-aware
extraction would improve Board AI answers and table-from-document.

### 4. Reading scanned pages, forms and checkboxes (OCR)

**Theirs:** Low Cost, High Quality, Form and Table modes read scanned pages. They handle rotation
and skew, recognise handwriting, and detect checkboxes and radio buttons.

**For us:** this is a known gap. We read no text from images, so a scanned page yields empty text
(for example the board card "P10 step7 crop (empty-text page)"), and the crop tool deliberately
quotes nothing. Options are an outside OCR service or an AI vision call per page. Either one
costs money on every page, so it is a pricing decision (PRICING.md) before it is an engineering
one.

### 5. Comparing LLMs on the same document

**Theirs:** "LLM profiles" run the same prompts with different models and compare the answers.

**For us:** only useful internally, as a way to choose the managed default model per task using
the golden prompts and the rating battery. It is not a user feature.

## Considered and declined

- **A thumbnail strip in the full PDF window.** The owner declined it on 2026-09-27: "No I don't
  think we need a thumbnail."
- **Deploying extraction as an API, webhooks, import/export of projects.** These are developer
  platform features, outside CollabBoard's scope.

## Where we are already ahead

- A Note keeps a link to its source: document, page, and the exact passage when text was selected.
- Opening a Note's source link takes the reader to the cited page and outlines the passage.
- Unstract's Output Analyzer shows the output next to the page, but no value links to where in the
  page it came from.
