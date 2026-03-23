# AI Testing Guide

The AI pipeline has a golden test suite that validates generation, conversion, and auto-mode classification against a running dev server.

---

## Running the suite

Start the dev server first, then run any of these commands:

```bash
npm run ai:test                  # all suites
npm run ai:test:generation       # generation only
npm run ai:test:conversion       # conversion only
npm run ai:test:classify         # auto-mode classifier only
```

To run a quick sample of generation tests without hitting all 27 prompts:

```bash
npx tsx scripts/test-ai-prompts.ts --suite generation --limit 5
```

To point at a non-default server:

```bash
npx tsx scripts/test-ai-prompts.ts --suite all --base-url http://localhost:3001
```

---

## When to run which suite

| Trigger | Suite |
|---|---|
| Changed a generation system prompt | `generation` + `classify` |
| Changed the conversion route or prompts | `conversion` |
| Changed validators or Zod schemas | `all` |
| Changed the classifier prompt | `classify` |
| Before merging major AI pipeline changes | `all` |
| Debugging a specific mode/subtype failure | `generation --limit N` |

The classify suite is fast (~12 calls, ~5s). Conversion is also short (~4 calls). Generation is the longest (~27 calls, ~2-3 min).

---

## What the suites test

### Generation (`lib/ai/golden-prompts.ts`)

27 prompts across all modes and subtypes (3 per group):
- `lesson_board`
- `diagram/flowchart`, `diagram/mindmap`
- `diagram/pie_chart`, `diagram/bar_chart`
- `diagram/timeline`, `diagram/comparison`
- `photo_card`
- `workshop_board`

Each prompt runs through the live generation route and is then:
1. Checked for a valid `StoredAIContent` envelope
2. Re-validated against the same Zod schema the route uses
3. Run through structural assertions (e.g. positive values, non-empty fields, no HTML in code)

### Conversion (`lib/ai/test-fixtures/conversion-fixtures.ts`)

4 canonical conversion pairs using pre-built minimal source envelopes:
- `flowchart → mindmap`
- `mindmap → flowchart`
- `pie_chart → bar_chart`
- `bar_chart → pie_chart`

Each asserts the result has the correct subtype, renderer, and structural integrity.

### Classify (`lib/ai/test-fixtures/classify-fixtures.ts`)

12 benchmark prompts covering all modes and diagram subtypes. Clear-intent prompts assert `high` confidence. Ambiguous prompts (marked `allowLowConfidence: true`) only assert the correct mode/subtype — any confidence is acceptable.

---

## Reading the output

```
[PASS] lesson_board_water_cycle  Water cycle lesson for middle school
  [PASS] title is a non-empty string
  [PASS] at least 2 sections
  [PASS] each section has a non-empty title

[FAIL] pie_chart_school_budget  School budget distribution
  [PASS] title is a non-empty string
  [FAIL] all dataPoint values are positive numbers [schema_validation_failure]
```

The summary groups failures by **mode/subtype** and by **failure category**:

```
Generation — 25/27 passed
  By mode/subtype:
    lesson_board            3/3
  ! diagram/pie_chart       2/3
    diagram/bar_chart       3/3
    ...
  By failure category:
    schema_validation_failure: 2
  Failed tests:
    - pie_chart_school_budget
```

---

## Failure categories

| Category | Meaning | What to do |
|---|---|---|
| `empty_required_field` | A required field (title, code, dataPoints) is missing or empty | Strengthen the system prompt to explicitly require the field |
| `schema_validation_failure` | Data passed the route but failed a cross-check (e.g. non-positive chart values) | Add an explicit constraint to the system prompt (e.g. "all values must be > 0") |
| `renderer_risk_output` | The output contains content that would confuse the renderer (e.g. HTML in a code field, overly long image query) | Tighten the prompt's output format rules |
| `classifier_mismatch` | Auto-mode returned the wrong mode or subtype | Review the classifier prompt; check if the test prompt is genuinely ambiguous |
| `conversion_mismatch` | Converted result has wrong subtype or renderer | Check the conversion route prompt; the source format may be confusing the model |
| `invalid_json` | The model returned something that could not be parsed as JSON | Usually a provider failure; retry to confirm or check for code fence leakage |

---

## Interpreting low-confidence classifier results

Fixtures with `allowLowConfidence: true` are intentionally ambiguous prompts. A low-confidence result is acceptable — the mode/subtype still needs to match.

If a formerly clear prompt starts returning `low` confidence, that's a regression worth investigating. It usually means the classifier prompt has drifted or the prompt wording is being misread.

---

## When a failure is a prompt problem vs a code bug

**Prompt problem** (tune the system prompt):
- `schema_validation_failure` on numeric fields (values not positive, missing required keys)
- `empty_required_field` on optional-but-expected fields
- `renderer_risk_output` (HTML in code, long image queries)
- `classifier_mismatch` on clearly-worded prompts

**Code bug** (check the route or validator):
- HTTP 4xx/5xx response
- `invalid_json` consistently on the same prompt
- Schema re-validation failure that should have been caught by the route
- `conversion_mismatch` on subtype/renderer field (route is building the envelope incorrectly)

---

## Adding new prompts

New golden prompts go in `lib/ai/golden-prompts.ts`. Keep them representative of real user input, not edge cases. Edge-case testing is a different layer.

New conversion fixtures go in `lib/ai/test-fixtures/conversion-fixtures.ts`.
New classifier benchmarks go in `lib/ai/test-fixtures/classify-fixtures.ts`.

---

## CI

Two workflows live in `.github/workflows/`:

| Workflow | File | Trigger | Suites |
|---|---|---|---|
| AI Quality | `ai-quality.yml` | PR to `main`/`master` | classify → conversion → generation |
| AI Quality (nightly) | `ai-quality-nightly.yml` | Daily 02:00 UTC + manual | all (single run) |

Both workflows build the app with `npm run build`, start the production server, wait for it to be ready, then run the suites in order. The nightly run can also be triggered manually from the Actions tab via `workflow_dispatch`.

### Required GitHub secrets

Set these in **Settings → Secrets and variables → Actions**:

| Secret | Purpose |
|---|---|
| `DEEPSEEK_API_KEY` | AI generation, conversion, classify routes |
| `NEXT_PUBLIC_SUPABASE_URL` | App build + runtime |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | App build + runtime |
| `SUPABASE_SERVICE_ROLE_KEY` | App runtime |
| `UNSPLASH_ACCESS_KEY` | `photo_card` mode image search |
| `PEXELS_API_KEY` | `photo_card` mode fallback |

### Reading CI output

Each suite step streams output directly to the job log. If a step exits non-zero, GitHub marks the job as failed and highlights the step.

Test result files are uploaded as artifacts on every run (pass or fail):
- PR runs: `ai-test-results-pr-<number>`, kept 30 days
- Nightly runs: `ai-test-results-nightly-<run-id>`, kept 90 days

Download the artifact from the Actions run page to get the full annotated output.

### Reproducing a CI failure locally

The CI run and a local run are equivalent. To reproduce:

```bash
# Start the dev server (or a production build)
npm run dev

# In another terminal — run whichever suite failed
npm run ai:test:generation
npm run ai:test:conversion
npm run ai:test:classify
```

The only difference between CI and local is that CI uses `npm run build && npm start` (production build) while local typically uses `npm run dev`. Both hit the same API routes.

If the failure only appears in CI and not locally, check:
1. The failing suite's artifact — the error message will be in the downloaded `.txt` file
2. Whether the relevant secret is set in GitHub (a missing `DEEPSEEK_API_KEY` will cause HTTP 500s, not test failures)
3. Whether a cold-start compilation issue caused a timeout — rerun the job once to confirm it's not a flake
