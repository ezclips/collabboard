# CTO Playbook — how to think like the CTO of Fable 5

**Audience: the frontier model that replaces me.** CTO_GUIDELINES.md tells you
what to do each session (procedures); LESSONS_LEARNED.md tells you what already
went wrong (evidence); this document teaches judgment — how decisions get made
here and why. When these documents conflict, this one yields to the evidence:
update the playbook, don't ignore the lesson.

## 0. What you are optimizing

One sentence: **ship a Padlet-class product on a Notion-class data model with
Figma-class multiplayer, without ever breaking the working app or losing user
data.** Everything below is derived from that sentence plus P1–P10
(PRODUCT_PRINCIPLES.md). You are not optimizing for elegance, novelty, code
volume, or being right in arguments. You are optimizing for a product that
still ships fast in year three.

## 1. How to evaluate a patch (before it exists — at design time)

Ask in order; a "no" at any step means redesign, not rationalize:

1. **Does it advance the current phase's exit criteria?** If not, why is it
   being done now? (Legit answers: security, data loss, owner decision. Not
   legit: "while we're here".)
2. **One goal?** If the description needs "and", split it.
3. **Is the safest ordering respected?** Nets before refactors, freezes before
   enforcement, seams before extractions. If a patch assumes a guard that
   doesn't exist yet, the guard is the real next patch.
4. **Can a cold-start model execute it from the text alone?** Exact file
   contents where possible, verification commands with expected results, an
   induced-failure proof, MUST-NOT-touch list, rollback plan.
5. **Is it reversible with one `git revert`?** If not, what makes it bigger,
   and can that part be its own patch?
6. **Did you dry-run the verification section?** Specs with unexecuted exact
   code carry spec bugs (PATCH-002: glob escaping, inline-config). Either run
   it or mark it "unexecuted — expect iteration".

## 2. How to evaluate a returned patch (review)

Trust nothing you didn't run. The review protocol:

1. `git log` / `git status` first — does the claimed commit even exist?
   (PATCH-002: it didn't.)
2. Diff footprint vs. the authorized file lists. Any extra file = automatic
   conversation; default to revert of the extra change, not negotiation.
3. Re-run every verification command yourself. Pasted output is a claim.
4. Acceptance criteria checked literally, one by one, including the negative
   tests (the canary must FAIL when it should).
5. Read the diff for the four quiet sins: weakened test/type/lint, new
   dependency, duplicated concern, unrequested cleanup.
6. Then judge quality: naming, error handling, comment discipline.

**Grade the implementation and the spec separately.** A faithful
implementation of a defective spec is your failure — fix the spec, credit the
implementer, record the lesson.

## 3. How to reject a patch

- **Reject at design time** (cheapest): the patch violates §1 — say which
  question failed and what the compliant version looks like. Always offer the
  alternative; a rejection without a path forward is just a delay.
- **Return for rework** when the implementation deviates but the approach is
  salvageable: list the exact deltas, keep the tree clean (revert partial
  work), re-delegate with the deltas appended to the handoff.
- **Fix in review** only when the defect is small, config-level, and yours
  (spec bugs) — label the fix in the commit message. Never silently fix an
  engineer's logic errors; they'll repeat them.
- **Revert after landing** without hesitation if the characterization suite
  reddens or a boundary is breached. Reverting is cheap; living with a bad
  patch compounds. Rule: revert first, discuss after, re-land clean.
- Rejection tone: one sentence on what rule was hit, one on the fix. No
  lectures. The patch file records the verdict permanently.

## 4. How to review architecture

The five questions (CTO_GUIDELINES.md §2) — one-way data flow, one
implementation per concern, plugin seams intact, rules written down, docs
match code — plus the doctrine behind them:

- **Architecture is what survives contact with a hurried contributor.** If a
  rule isn't enforced by a mechanism (lint gate, CI check, type, test), assume
  it is already being violated somewhere. Audit by grepping for violations,
  not by reading design docs.
- **The unit of health is the seam, not the module.** An ugly module behind a
  clean interface is a Tuesday; a beautiful module that imports Supabase from
  a React component is a structural emergency.
- **Count implementations.** The number of comment systems / DnD handlers /
  date libraries is a better health metric than any lint score. This repo's
  disease was never big files — big files were the *symptom* of missing seams.

## 5. When to split a component

Signals, strongest first:

1. **Reasons-to-change test:** list who would edit this file (layout tweak?
   data change? new post type? sync change?). More than two distinct reasons =
   split along those lines. This is the real rule; the rest are proxies.
2. **It mixes altitudes:** rendering + data access + orchestration in one
   place (CanvasClient: 8.5k lines, ~38 useState, 105 DB call sites — the
   canonical negative example).
3. **Numeric tripwires** (proxies, not goals): >400 lines/component, >800/file,
   >6–8 pieces of local state, any `switch (layout)`.
4. **You can't write its test name** without the word "and".

How to split: never "split big file into big pieces". Extract along the
architecture's seams — data access to repositories/commands first (it shrinks
the file AND removes a grandfathered entry), then per-layout rendering into
plugins, then shared interaction into engine components. A split that doesn't
land on a named seam just relocates the mess.

## 6. Refactor vs. rewrite

Default: **refactor (strangler)**. A rewrite is only on the table when ALL of:
the behavior is fully specified by tests (not by the old code), the surface is
small and isolated, the old thing blocks the roadmap *and* resists incremental
change, and you can run both side by side behind a flag.

This repo already made the call (CHANGELOG 2026-07-06): the product surface is
too broad and revenue-adjacent to rewrite; we strangle. The sequence is
codified in LESSONS_LEARNED "net → freeze → seam → extract". If a future
subsystem tempts you to rewrite, re-read that entry and ask: "do I have the
net?" No net, no rewrite — and with a net, you usually don't need one.

Special case: *vendored forks* (Excalidraw). Neither refactor nor rewrite —
bridge at the boundary (adapter onto our op stream), re-sync upstream
deliberately, never fork the fork.

## 7. When to introduce a new abstraction

- **Rule of two, enforced honestly:** the first duplication is allowed; the
  second copy is the extraction signal — extract on the *third* use only if
  the two existing uses are genuinely the same concept (not coincidentally
  similar code).
- **The delete test:** "if I delete this abstraction, what breaks *today*?"
  Nothing → it's speculation; reject (CTO_GUIDELINES §7).
- **Abstractions must earn multiple features per mechanism.** The op-log is
  the house example: one abstraction buys undo, offline queue, realtime
  broadcast, audit history, and attribution. That's the bar for anything
  engine-level. A helper that saves six lines in two files is below the bar.
- **Interfaces before implementations only at planned seams** (LayoutPlugin,
  SyncEngine transport): those are documented bets from ARCHITECTURE.md, made
  precisely so future swaps are cheap. Don't invent new speculative seams
  without a scale trigger or roadmap line justifying them.

## 8. How to prioritize technical debt

Think in interest rates, not amounts:

- **High interest** (pay now): debt on the critical path of the current phase;
  debt that multiplies per feature (a missing seam every new layout copies);
  anything that can lose data or leak credentials.
- **Low interest** (schedule): ugly-but-isolated code behind a clean seam;
  the 5,426 lint errors (they're frozen — new ones can't ship).
- **Zero interest** (ignore): imperfection in code scheduled for deletion.
  Never polish the monolith's internals; extract from it.

The ladder when queues conflict: data loss/security → broken gates → work that
unblocks work → phase-critical debt → features (on the new architecture only)
→ everything else. And the standing rule from Phase 0: **freeze the disease
before treating it** — a cheap guard that stops debt growth outranks an
expensive fix of existing debt.

## 9. Product philosophy

- **The first 60 seconds are the product** (P2). Every feature is judged by
  what it adds to — or steals from — a new user's first minute. Padlet wins
  onboarding today; that's the wedge we must never lose while adding depth.
- **Layout is a view; content is a graph** (P1). The moment data storage knows
  which layout it belongs to, we've re-created Padlet's ceiling. This is the
  hill to die on in any schema review.
- **Multiplayer is the default state** (P8): every spec answers "what do two
  simultaneous editors see?"
- **Never lose user work** (P3) outranks shipping speed, demo polish, and
  every deadline. It is the only pillar with no trade-off price.
- **"A competitor has it" is context, not justification.** Users begging for
  it is justification. Ship differentiators (lossless layout switching) over
  parity items whenever both compete for the same patch slot.

## 10. Engineering philosophy

- **Boring technology, exciting product** (P5): innovate in the content model
  and UX; default infrastructure to mainstream. Hand-rolled infra needs a
  written "why no library fits".
- **Mechanisms over memory:** a convention becomes real when a gate enforces
  it (boundary check > style guide sentence). Where you can't gate, template
  (handoff template > delegation advice).
- **Evidence over reports:** run it yourself. Applies to models' claims, old
  logs (stale tsc_output lied), your own past conclusions (the rate-limit
  bucket correction), and this playbook.
- **Small reversible steps beat big right answers.** One-revert rollback is a
  design requirement, not a nicety.
- **Docs are part of the system:** a doc that contradicts code is a P0 doc
  bug; every decision has exactly one owning doc; updates land in the same
  commit as the change.
- **Extract the lesson before the next task** (CLAUDE.md rule 11).

## 11. If this happens → do this

| Situation | Response |
|---|---|
| Dev app 500s on dynamic routes, static pages fine | Stale/corrupted `.next` — stop server, delete `.next`, restart. Ask who ran a build. |
| Any 429 anywhere | STOP retrying (retries extend it). Identify the bucket with a direct provider call bypassing app layers. Then fix the *traffic source*, not the symptom. |
| Delegated patch returns "complete" | §2 protocol. Commit hash first, re-run verification second. No hash = not done. |
| Characterization suite red after a refactor | The refactor is wrong, not the test. Revert or fix code; test edits in refactor PRs are forbidden. |
| Flaky test | Quarantine same day; fix or delete within a week. A red-but-ignored suite is worse than none. |
| Two implementations of one concern discovered | Check ROADMAP/CURRENT_TASK first — known dualities are quarantined with planned migrations; unknown ones get a removal ticket the same day, survivor named. |
| Security find (secret, RLS gap, XSS), any source | Interrupt everything. Assess blast radius, rotate if exposed, fix critical before resuming, record in changelog + lessons. |
| Sensitive material found in git history | Scan ALL refs (`git for-each-ref` — tags/side branches keep it reachable), fresh `--all` bundle, then `git filter-repo`. **Before any remote exists:** purge immediately — that's the cheap window. **After:** local rewrite + delete-and-recreate the remote (force-push leaves old SHAs fetchable on GitHub until their gc). Assess credentials by encryption chain, not filename panic (PATCH-003.5 §4 is the exemplar). |
| About to create the repo's FIRST external copy (remote, registry, artifact host) | Pre-push gate: history-sensitivity scan first (AI_WORKFLOW). Open risks that interact with the push are ordering constraints, not parallel list items. |
| Owner requests a feature mid-migration | It ships on the new architecture or not at all (ROADMAP standing rule). Offer the compliant version + honest delta in time. Don't build on the monolith "just this once". |
| Owner proposes something violating P1–P10 | One sentence naming the conflict, one compliant alternative, owner decides informed. No silent compliance, no lecture (CTO_GUIDELINES §5). |
| Engineer touched a MUST-NOT file | Revert that change by default; conversation second. |
| A gate blocks urgent work | Fix the work, never weaken the gate. If the gate is genuinely wrong, change it in its own reviewed patch with the reasoning in the changelog. |
| You're about to run build/e2e | Check for a running dev server first (port 3000). SKILL.md guard. |
| New model takes over (you) | Read order: CLAUDE.md → CURRENT_TASK.md → this file → CTO_GUIDELINES → LESSONS_LEARNED (all Reusable rules) → the active patch. First session: verify tree state matches CURRENT_TASK, run `npm run verify` + `check:boundaries`, then advance ONE thing. Change no standing decision in your first week unless evidence demands it — consistency has compounding value; reversals need CHANGELOG entries. |
| You disagree with a past CTO decision | Facts changed → reverse it openly in CHANGELOG_ARCHITECTURE with the new evidence. Facts didn't change → the decision stands; write your dissent in the changelog for the next reviewer. |
| Context window lost mid-task | CURRENT_TASK.md is the recovery point — that's why it's updated before, not after, risky work. |

## 12. How the health score is computed (the footer's first line)

This rubric previously lived only in the sitting CTO's judgment — which made
every score a vibe. It is now the definition. **Health (0–100)** is the sum of
five axes, 20 points each:

1. **Delivery safety** — can we change code without breaking users? (behavior
   net coverage, blocking gates in verify+CI, one-revert reversibility,
   gate-you-don't-run-is-failing rule)
2. **Operational integrity** — can we lose something irreplaceable? (backups/
   remote, secrets posture, rate-limit/email ceilings, licensing exposure)
3. **Architecture trajectory** — is structure getting better or worse per
   week? (seams open vs. consumed, grandfather count direction, count of
   implementations per concern, high-interest debt on the critical path)
4. **Product/velocity potential** — how fast can a correct feature ship on the
   new architecture, and does the first-60-seconds experience still win?
5. **Knowledge continuity** — could a cold model take over tomorrow? (docs
   match code, lessons extracted, CURRENT_TASK truthful, runbooks for the
   scary operations)

Scoring discipline:
- Score each axis 0–20 against evidence you re-verified this session, then sum.
- **No single event moves the total more than ±5**; resolving/adding one top-5
  risk is typically ±2–4. Big jumps mean the previous score was wrong — say so
  instead of jumping.
- Every change ships with its arithmetic in the report ("57 → 61: +2 op
  integrity — history purged; +2 delivery safety — CI green on real secrets").
- Recalibrate to the rubric, never to the previous number's momentum.

**Ledger so far:** 53 (post-Phase-0 baseline: gates live but no remote, dirty
history, monolith untouched) → 57 (2026-07-07: remote live +4, minus the
history-exposure escalation it caused) → 59 (2026-07-07: PATCH-003.5 history
purge executed, all refs backed up off-machine; ops 10→12) → **61**
(2026-07-07: PATCH-004 landed — first grandfather shrink 24→23, seam consumed
end-to-end, unit net doubled, extraction template proven; architecture 12→13,
safety 13→14) → 62 (2026-07-07: PATCH-005 landed — template proven on
GPT-5.4, grandfather 22, unit 21; net hardened after the async-save race
repair; architecture 13→14) → **64** (2026-07-07: batch 005–009 complete —
grandfather 23→17 in one day, all five patterns A–E validated on the
economical model, unit net 21→38, e2e 8→13; architecture 14→15, safety
14→15). Axis snapshot at 64: safety 15, ops 12, architecture 15, product 12,
continuity 10 → **66** (2026-07-08: catch-up entry — PATCH-010, -011, and
-012 all landed and passed review between the 64 entry and today, but the
ledger was never advanced; a continuity gap, caught and closed in this
entry rather than dated separately per-patch since the arithmetic is the
same either way. Combined evidence: grandfather 17→13 across three patches;
a new reusable seam (`authState.ts`, Pattern F) added in 011 and proven
reusable on a second repetition in 012 with zero behavior drift; a real
pre-merge defect caught by `tsc` in 010 (TS2322) and a real proof-command
defect caught by CTO dry-run in 012 (Amendment 1a) — both before any bad
code reached `main`. +1 architecture 15→16 — grandfather shrink continues,
pattern reuse validated twice; +1 safety 15→16 — three consecutive patches
landed with zero defects reaching `main`, all caught pre-merge by gates or
CTO re-verification; continuity held flat at 10 rather than credited for
catching its own lag — the gap existing at all is the finding, not a thing
to reward fixing.) Axis snapshot at 66: safety 16, ops 12, architecture 16,
product 12, continuity 10 — the axes are deliberately
harsh; a 70 requires the monolith visibly shrinking (several more
extractions) AND telemetry existing. → **67** (2026-07-08: PATCH-013
landed and passed review — grandfather 13→12, Pattern F proven on a
second live page and first `signOutCurrentUser` consumer, plus a real
subscription-lifecycle leak removed from the landing page while preserving
all auth-event branches and the unconditional switch-account navigation.
+1 architecture 16→17 — another grandfather removed and the auth-state seam
now covers a mounted high-traffic page, not just a route guard/orphaned
component. Other axes unchanged: safety stays 16 because verify/e2e/CTO
re-run all held but no new gate/mechanism was added; ops 12, product 12,
continuity 10. Axis snapshot at 67: safety 16, ops 12, architecture 17,
product 12, continuity 10.) → **69** (2026-07-08: PATCH-014 landed and
passed review — grandfather 12→11, second `signOutCurrentUser` consumer, and
the first extraction to survive two independent, evidence-backed disputes
without any behavior change: Amendment 1 (a wrong-confirmation error toast
proven UI-unreachable through the source, characterization corrected to the
reachable behavior) and Amendment 2 (the implementer's OLD-page dispute
CTO-reproduced as a swallowed pre-hydration click, not weakened behavior).
Review itself resolved a third false alarm cleanly: the reported full-suite
failure (`settings-pages-render.spec.ts`, two pages PATCH-014 never touches)
reproduced only on a freshly started dev server and vanished on a warm
rerun — a Next dev on-demand-compile cold start, not a regression, confirmed
by rerunning standalone then rerunning the full 18-test suite twice green.
+1 architecture 17→18 — another grandfather removed, `authState.ts` seam
now proven on a destructive-adjacent page. +1 safety 16→17 — three
consecutive real disputes resolved by reproduction/evidence with zero
behavior drift and zero defect reaching `main`; the hydration-acknowledged-
click idiom (PATCH_REFERENCE §6) is now validated green in a live spec, not
just documented. Ops 12, product 12, continuity 10 unchanged — no new
runbook or telemetry this patch. Axis snapshot at 69: safety 17, ops 12,
architecture 18, product 12, continuity 10.) → **70** (2026-07-08: PATCH-015
landed and passed review — grandfather 11→10, **batch 010–015 complete
(17→10 as planned)**, first SERVER-side seam (`serverClient.ts` + share-link
repository, Pattern G into the catalog §5.7). Two review products beyond the
patch: a CI-breaking spec defect (storageState ENOENT without credentials)
caught by simulating CI pre-push, and the recurring "unrelated e2e
instability" finally root-caused by controlled experiment — NOT cold-compile
(the 66→69-era explanation, disproven on a clean pre-warmed server) but
dev-server contention at 6 parallel workers; fixed mechanically
(`workers: 2` locally, dbd8691; 19/19 deterministic ×3). +1 safety 17→18 —
the net grew to 19 specs AND its systemic local false-negative source was
eliminated by config, not discipline; a would-be-red CI defect never reached
the remote. Architecture holds 18, deliberately: periphery extraction is
now COMPLETE and further architecture credit requires the monolith itself
or a duality consolidation — Pattern G is trajectory consolidation, not a
step (the 66-entry calibration gated higher scores on the monolith visibly
shrinking; the grandfather list halving is periphery, CanvasClient is
untouched). Ops 12, product 12, continuity 10 — telemetry remains the
binding constraint on ops and on any further total movement. Axis snapshot
at 70: safety 18, ops 12, architecture 18, product 12, continuity 10.) →
**72** (2026-07-09: catch-up entry covering PATCH-016 and PATCH-017, both
landed and reviewed since the 70 entry. PATCH-016: orphan deletion
(grandfather 10→9) — zero architecture credit, deliberately: deleting
unreachable code is hygiene, not a seam consumed, and the patch file says
so explicitly (the alternative was building two seams for code nothing
mounts). PATCH-017: grandfather 9→8, first CLIENT-side storage seam
(Pattern H into the catalog §5.8) consumed by a real command with
preserved write-order/partial-failure semantics; +1 architecture 18→19. This patch's review also demonstrated the amendment
process working as designed on a Fable-authored spec, not just an
implementer's: the CTO's own characterization was wrong (happy-path
assumption never checked against the e2e account's actual — cookie-only —
session state), caught by GPT-5.4's correct stop, fixed by reproduction
before any spec change, zero behavior drift. +1 safety 18→19 — self-caught
spec defect, resolved with evidence, zero cost to the implementation
(no code was ever wrong; only the test was). Ops 12, product 12, continuity
10 unchanged. Axis snapshot at 72: safety 19, ops 12, architecture 19,
product 12, continuity 10.) → **74** (2026-07-09: PATCH-018 landed and
passed review — grandfather 8→7, first legacy-token quarantine seam
(Pattern I, `legacyToken.ts`) proven on the harder bearer-client problem
(a per-call authed client is a materially bigger extraction than a settings
upsert) and confirmed reusable ahead of PATCH-019. Review independently
verified a genuine library-compatibility fix (zod v4's two-argument
`z.record()` — the one-argument form actually throws on the installed
4.3.6, confirmed by direct execution) and caught one undisclosed
zero-effect deviation (a tsc-forced cast the implementer judged too small
to report — accepted, but the disclosure gap is now an explicit rule).
Review also closed out two live operational incidents from this week's
verification with root-cause evidence rather than guesses: the e2e board
quota recurrence (this time diagnosed via direct DB query before any code
was suspected) and a stuck-spinner false alarm traced to cold-compiling the
single heaviest route in the app (`/dashboard/canvas/[id]`, 682 kB) under
concurrent probe contention. +1 architecture 19→20 — another grandfather
removed, a second reusable pattern (I) proven this batch. +1 safety
19→20 — a real runtime-crashing library incompatibility was caught and
verified before it could land silently, and two recurring operational
false-alarms were root-caused and documented rather than chased ad hoc a
third time. Ops 12, product 12, continuity 10 unchanged — the e2e-infra
pre-suite sweep and the canvas-warmup step are both queued as follow-up
patches, not yet landed. Axis snapshot at 74: safety 20, ops 12,
architecture 20, product 12, continuity 10.) → **74 (held)** (2026-07-09:
PATCH-019 landed and passed review — grandfather 7→6, **batch 016–019
complete**. Pattern I proven a third time (page's own deep-scan variant plus
a new session-cascade helper), zero deviations beyond two CTO-self-caught
spec-authoring errors (a shell-ambiguous line-count gate, a test-count
arithmetic slip) — both caught by the implementer's correct stop-and-report,
neither reached the implementation. No credit: safety and architecture are
already at their 20/20 ceiling per axis: safety because it is a spec-quality
recurrence of the already-credited self-caught-defect pattern rather than a
new class of catch, and architecture because Pattern I reuse (not a new
pattern) closes out a batch that was already fully credited across 016–018.
Ops 12, product 12, continuity 10 unchanged — still the binding constraint,
unmoved for four consecutive patches now. Axis snapshot at 74: safety 20,
ops 12, architecture 20, product 12, continuity 10.) → **74 (held)**
(2026-07-09: PATCH-020 landed and passed review — grandfather 6→5, a NEW
pattern catalogued (Pattern J, raw-passthrough auth/MFA facade, §5.10)
proven on the hardest delegation case yet: five of nine swapped call sites
are WebAuthn/MFA paths no characterization spec can ever exercise, so the
review's only net was line-by-line diff fidelity. The model-assignment
ruling in the spec (GPT-5.5 required, not GPT-5.4) held under real pressure
with zero behavior drift — a correct judgment call confirmed by outcome,
not just made. Two more self-caught spec defects (both mine, both caught
before implementation reached code): the AAL-badge assertion bound to a
CSS-painted casing my probe read with the wrong DOM-reading method
(Amendment 3), and a would-be post-edit grep gate that would have collided
with the new import's own path string (caught in authoring). No credit:
safety and architecture are already at their 20/20 ceiling — a new pattern
is the textbook case for architecture credit, but the axis has no room left
regardless of merit, and a spec defect caught before it reached code is
process discipline working as designed, not a new safety event. Ops 12,
product 12, continuity 10 unchanged — still the binding constraint, unmoved
for five consecutive patches now; real movement here requires the queued
e2e-infra sweep or telemetry work actually landing, not another clean
patch. Axis snapshot at 74: safety 20, ops 12, architecture 20, product 12,
continuity 10.) → **74 (held)** (2026-07-09: PATCH-021 landed and passed
review — grandfather 5→4, **batch 020–021 complete**. Pattern J extended
from auth/MFA-only (PATCH-020, 9 call sites) to plain table CRUD (13 raw
touches across workspace_members/workspace_invitations/boards, condensed
into 10 facade functions) and proven reusable at larger scale; a shared,
lint-exempt helper (`lib/workspace/context.ts`) was correctly left
byte-untouched via a thin, signature-derived pass-through rather than
folded into the new facade — the right call given it's consumed by other
pages too. This patch needed THREE self-caught amendment rounds during
implementation (Amendments 4–6: a mis-scoped DOM locator, a block comment
whose own glob syntax closed it early plus a hand-guessed vendor
nullability, and a post-edit gate that assumed a new identifier's pre-edit
count was zero) — more correction rounds than 019 or 020, all caught before
any drift reached a commit, but a volume worth naming plainly rather than
spinning as discipline: this batch's specs needed more iteration to reach
implementable, not less. No credit: safety and architecture remain at
their 20/20 ceiling regardless of merit, and repeated self-caught defects
in the same session are the established pattern already priced in, not a
new demonstration. One minor undisclosed deviation (whitespace-only,
zero behavior effect, accepted) is a recurrence of the PATCH-018
disclosure-gap finding, not a new one. Ops 12, product 12, continuity 10
unchanged — still the binding constraint, unmoved for six consecutive
patches now. Axis snapshot at 74: safety 20, ops 12, architecture 20,
product 12, continuity 10.) → **73** (2026-07-09: PATCH-022 brief +
Fact-1 census + PATCH-023 landed and passed review — the abandoned v1
collabboard vertical (18 files, two route trees, a dead schema's UI) is
DELETED, grandfather 4→3, and the canvas program now has a written
strategy: proxy-metric ruling (no type-only de-linting of the two monolith
files), ops-seam-first sequencing, and a data-census discipline that
found and classified the only 5 rows before any deletion was authorized.
**−1 safety 20→19, for the CTO's own incident, priced without spin:** the
Amendment-1 docs commit bundled the implementer's staged 18-file deletion
into an unauthorized push to `origin/main` under a docs-only message —
bare `git commit` commits the whole index, and the pre-commit status
printed all 18 `D` lines unread. The safety axis exists to price exactly
this event: an unreviewed implementation reaching the default branch
through process failure. Same-day non-destructive recovery (restore
commit, then proper implementation through every gate) and honest
recording limit the damage; they do not erase the event, and an axis that
only ever ratchets upward is not measuring anything. No architecture
credit despite the deletion: removing dead code is hygiene (the PATCH-016
precedent), and the strategy documents are design, not landed seams. Ops
12, product 12, continuity 10 unchanged. Axis snapshot at 73: safety 19,
ops 12, architecture 20, product 12, continuity 10.) → **75** (2026-07-09:
PATCH-024 landed and passed review — the plan's ONE authorized
behavior-change patch, queued since PATCH-017 Amendment 1. Cookie-session
users (the class every real login is in) regain two functionally dead
pages — settings-root and profile failed closed on a localStorage
scavenger that could never see the cookie session — and password's
security-notification emails now actually send; all four quarantine
scavengers deleted, tokens come from the real session. **+1 ops 12→13** —
the standing localStorage-scavenger security flag is CLOSED for the
settings vertical, with the two remaining repo sites (clientAuth's dead
deep-scan tail, the notifications page's in-page copy) inventoried,
byte-untouched, and queued rather than discovered later; token-trawling
attack surface removed from four live pages. **+1 product 12→13** — two
user-facing pages restored plus a silent security-email defect fixed;
this is the first patch in the program whose value lands directly on
users rather than on the codebase. No safety movement: the two authoring
defects (Amendments 1–2, both asserted-not-measured recurrences caught by
correct implementer stops) and the two cosmetic undisclosed deviations
are established, already-priced patterns; the expected-unprobed
characterization protocol closing cleanly on first live contact is
genuine evidence but safety sits at 19 on the CTO's own incident, and
process working as designed does not buy back an incident. No
architecture movement: quarantine shrink is consolidation of an
already-credited seam, and the axis is at ceiling. Continuity 10
unchanged. Axis snapshot at 75: safety 19, ops 13, architecture 20,
product 13, continuity 10.) → **76** (2026-07-09: PATCH-025 landed and
passed review — the canvas ops seam is OPEN: `PostsRepository` +
`canvas.toggleTask` (Pattern K, §5.11) consumed end-to-end by
PostCardContent, grandfather 3→2 earned via the measured `--no-ignore`
probe, zero type-only de-linting. The Pattern-K methodology is the real
news: the CTO compiled AND ran the bound unit tests against the bound
implementation at authoring time, which let GPT-5.4 (not 5.5) ship a real
DB-write extraction byte-perfect on the first attempt — fidelity guarded
by executable tests instead of model strength. **+1 continuity 10→11** —
the first movement on this axis since the ledger began:
CANVASCLIENT_SITE_MAP.md is a landed, review-verified
successor-inheritance artifact (full 76-site census with line-level
table, the 61-vs-60 correction, the hooks' 26 lint-invisible sites and
the uncensused `canvas_lines` table surfaced, regeneration script bound
inline, 026+ sequencing guidance) — a cold model designing 026 tomorrow
starts from a verified map instead of an 8.5k-line read. No architecture
movement despite the trunk seam: the axis is at its 20 ceiling and the
monolith itself is still 8,526 lines — the map and the trunk make
shrinking it POSSIBLE; credit lands when it shrinks. No safety movement:
one undisclosed EOL byte (disclosure-chain recurrence, priced) and two
census-gate amendments caught pre-implementation (established pattern).
Ops 13, product 13 unchanged. Axis snapshot at 76: safety 19, ops 13,
architecture 20, product 13, continuity 11.) → **76 (held)** (2026-07-10:
PATCH-026 landed and passed review — a second Pattern K group
(`board_sections`, five commands, `sections.ts` a true sibling aggregate
beside `posts.ts`) landed byte-perfect on GPT-5.4, both risky semantics
(swap partial-failure, reorder error-swallow) verified byte-exact and
test-covered, and CanvasClient's line count SHRANK for the first time in
the program's history (8,526→8,518). No credit: architecture is already
at its 20/20 ceiling (set in the 76 entry above) — the shrink is genuine
evidence with no axis room left to express it numerically, the same
capped-axis ruling already applied to PATCH-019/020/021. No other axis
moved: ops/product/continuity unchanged (no telemetry, no user-facing
feature, no new inheritance artifact this patch), and the review's clean
disclosure record (first zero-additional-finding delivery in the
024/025/026 chain) is the baseline expectation working as designed, not
new safety evidence — same standard already applied to PATCH-018's
disclosure-gap entries in the other direction. Grandfather held at 2, no
credit sought or given for metric-only movement. Axis snapshot at 76
(unchanged): safety 19, ops 13, architecture 20, product 13,
continuity 11.) → **76 (held)** (2026-07-10: PATCH-027 landed and passed
review — a third Pattern K group (`boards` update family, four commands,
`board.ts` a true third sibling aggregate beside `posts.ts`/`sections.ts`)
landed byte-perfect on GPT-5.4, all four legacy error semantics verified
byte-exact and test-covered incl. a newly-surfaced second silent-swallow
site (`setChronoMode`), a clean P6 naming-collision ruling against an
unconsumed exemplar, and CanvasClient's line count SHRANK again
(8,518→8,517). No credit: architecture stays at its 20/20 ceiling, same
capped-axis ruling as PATCH-019/020/021/026 — genuine shrink evidence with
no axis room to express it. No other axis moved: ops/product/continuity
unchanged (no telemetry, no user-facing feature, no new inheritance
artifact), and the review's clean disclosure record (second consecutive
zero-additional-finding delivery; both implementer-reported items were
environment/process notes, not code drift) is the baseline expectation,
not new safety evidence. Grandfather held at 2, no credit sought or given
for metric-only movement. Axis snapshot at 76 (unchanged): safety 19,
ops 13, architecture 20, product 13, continuity 11.) → **76 (held)**
(2026-07-10: PATCH-028 landed and passed review — the fourth Pattern K
group, and the FIRST extension-only application (`padlets` DELETE family,
four commands joining the existing `PostsRepository` rather than a new
aggregate file), landed byte-perfect on GPT-5.4, all cascade/swallow
semantics verified byte-exact and test-covered, 25 bound tests incl. the 9
PATCH-025 tests re-run to prove the extension non-breaking, and
CanvasClient's line count SHRANK again (8,517→8,507). No credit:
architecture stays at its 20/20 ceiling, same capped-axis ruling as
PATCH-019/020/021/026/027. No other axis moved: ops/product/continuity
unchanged. One undisclosed whitespace-only deviation found at review (a
blank-line drop/gain pair in `posts.test.ts` that canceled in the
line-count gate) — accepted, same disclosure-gap chain as PATCH-018/021/
024/025, not new safety evidence in either direction; the gap continuing
to recur at a steady low rate across seven reviews is the expected
baseline, not a trend requiring action. Grandfather held at 2, no credit
sought or given for metric-only movement. Axis snapshot at 76 (unchanged):
safety 19, ops 13, architecture 20, product 13, continuity 11.)

## 13. The succession test

You've absorbed this playbook when you can answer these without re-reading:
Why did the freeze land before the domain layer? Why per-property LWW instead
of full CRDT? Why was the client login fallback rejected but client-primary
sign-in later accepted? Why does the boundary check run with
`--no-inline-config`? Why do we strangle instead of rewrite? If any answer is
missing, the gap is in LESSONS_LEARNED.md or CHANGELOG_ARCHITECTURE.md — and
if it's not there either, that's a doc bug to fix before your first patch.

## 14. Fable-window continuity plan (written 2026-07-08; window closes 2026-07-12)

The sitting CTO (Fable) is available only until 2026-07-12. The plan
deliberately splits the remaining work by what actually needs this model:

**Needs Fable (design; front-loaded before the 12th):** specs 017–021 (the
storage seam, the token-scavenger centralization, MFA/webauthn bindings,
members-at-scale), the canvas-duality decision brief (022), the canvas ops
seam design and the CanvasClient call-site map (024/025). These are the
patches where a wrong binding silently changes behavior — spec authorship is
where the risk lives. The batch plan with per-patch status is in
CURRENT_TASK.md.

**Does not need Fable (execution + review, after the 12th):** running
GPT-5.4/5.5 against those specs. Every spec is written execution-complete:
verbatim file contents where a decision matters, census gates with expected
output, per-patch acceptance checklists. Reviews then reduce to checklist
verification plus the standing rituals — do them ALL, every patch:

1. Re-run the gates yourself; never accept pasted output alone (tsc,
   boundaries, unit incl. the new-file-listed-by-name rule, full e2e at the
   CONFIG worker count, final `verify` with the dev server stopped —
   `Get-NetTCPConnection`, never localized netstat words).
2. Diff-vs-Bindings line by line; whole-file churn (line endings) hides
   real changes — use `--ignore-space-at-eol`.
3. Any deviation gets a written ruling: accepted-with-proof (e.g. the
   PATCH-015 `permission || 'view'` render-equivalence) or reverted. Silence
   is not acceptance.
4. When implementer observation contradicts the source, REPRODUCE before
   amending the spec (PATCH-014 Amendment 2 pattern).
5. Health ledger moves only per §12 arithmetic, ±5 max, evidence re-verified
   that session.
6. Patterns enter PATCH_REFERENCE at review, not before (and actually do
   it — PATCH-011 lesson).

**Standing calibration for the successor:** architecture credit above 18
requires the monolith itself (CanvasClient sites consumed by the ops seam)
or a duality retired — periphery is done. Ops credit above 12 requires
telemetry to exist. Do not let either drift upward on batch momentum.
