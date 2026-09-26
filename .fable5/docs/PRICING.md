# Pricing and plans — the decision

Status: DECIDED by the CTO/PM on the owner's delegation (2026-09-25: "I will leave it up to
you as a PM, based on what other successful applications charge").
Nothing is live yet, so every number here can change before launch without migrating a
customer. Revisit once real usage exists.

---

## 1. What the market does (researched 2026-09-25)

| App | Free plan | Paid (per month) | What they charge for |
|---|---|---|---|
| Padlet | 3 boards, 20 MB/file, unlimited contributors | Pro ~$7–10: 250 MB/file; higher tiers 500 MB–1 GB | the number of boards and the file size; school licences |
| Milanote | 100 cards, 10 files; images 10 MB, files 50 MB | $9.99–12.50: unlimited; files up to 5 GB | the number of items |
| Miro | 3 editable boards; 30 MB/file | from $8/member | boards and seats |
| Notion | 5 MB/file, unlimited storage | ~$10: 5 GB/file; AI separate | the file size; AI |
| Heptabase | **no free plan**: a 7-day trial at Premium level | Pro $9–12 (Gemini only, 100 credits), Premium $18–24 (GPT/Claude, 1,800 credits, unlimited PDFs), Premium+ $54–72 | **AI credits**; PDF parsing is free of credits |

**Lessons:**
- Nobody sells storage in GB: "unlimited, fair use" is standard.
- Free plans stay small by COUNT (boards, files), not by size.
- The paid lever is file size and AI.
- The AI-heavy product (Heptabase) meters AI in credits, gives the cheap plan cheap models,
  and keeps basic Q&A free when credits run out.

## 2. Our product is two things, and that decides the model

- **Collaborative canvases (Padlet-like)** grow by SHARING: one owner, many contributors, most
  of whom will never pay. They need a free plan and **free contributors**.
- **Knowledge and AI (Heptabase-like):** PDFs, transcripts, Board AI, the wiki, and AI in
  tables. This is where our costs are: PDF processing (extraction, page images, search) and AI
  calls. It is where people should pay.

**Rule 1: the board owner's plan decides.** Anyone posting to a board (a student, a guest, a
teammate) works within the board OWNER's workspace plan: file size, PDF processing and AI.
Contributors never need to pay.

**Rule 2: AI is metered in credits; storage is not metered.** Files are "unlimited, fair use",
with a per-file size limit and a per-PDF page limit as technical safety nets.

**Rule 3 (changed 2026-09-26): your own AI key is a Premium feature, and costs no credits.**
Below Premium, a saved key stays saved but inactive: the call runs on the CollabBoard model and
uses credits. The key is never deleted. The board owner's plan decides, as everywhere (Rule 1).
**Why the change (owner, 2026-09-26):** a free own key gave Free users unlimited AI, including
premium models, and gave Pro users premium models for the Pro price -- it removed the reason to
upgrade for exactly the heavy AI users most likely to pay.

**Rule 4 (added 2026-09-26): Free is for evaluating.** A new workspace gets a **7-day Premium
trial** (no card, counted from the workspace's creation). When it ends without a payment, the
workspace becomes the small Free plan below: its boards stay usable and shareable and
contributors stay free (the sharing loop is how the canvas side grows), but AI is off and no new
documents are processed. Documents processed during the trial stay readable. Owner's choice of
"Mix: small Free stays" over a read-only lock (Heptabase) and over the old free-forever AI plan.

## 3. The plans

| | **Free** | **Pro** | **Premium** |
|---|---|---|---|
| Price | $0 (after a 7-day Premium trial) | **$9 / month**, or $90 / year | **$19 / month**, or $190 / year |
| Boards | 3 (as today) | unlimited | unlimited |
| Contributors on your boards | unlimited, free | unlimited, free | unlimited, free |
| File size, per file | 20 MB | 250 MB | 1 GB |
| PDFs and documents processed (Knowledge) | none new (those from the trial stay readable) | unlimited (fair use) | unlimited (fair use) |
| Pages per PDF | 50 | 500 | 2,000 |
| AI credits | none (AI is part of the trial only) | 500 / month | 2,000 / month |
| AI models | — | basic (cheap, fast) | basic + premium (GPT, Claude, Gemini Pro) |
| When credits run out | — (no AI on Free) | basic Q&A on boards stays free; creating and editing need credits | same as Pro |
| Your own AI key | — (saved keys stay, inactive) | — (saved keys stay, inactive) | ✓, costs no credits |

**Why these numbers:**
- **$9 and $19** sit exactly where Padlet, Milanote, Miro, Notion and Heptabase sit ($8–12 for
  the first tier, $18–24 for the second).
- **Free file size (20 MB) and 3 boards** equal Padlet's free plan.
- **250 MB** is the standard first paid tier (Padlet, Trello).
- **1 GB** matches Padlet's top tiers.
- **5 processed PDFs** echoes Milanote's 10 files. It keeps free users off our most expensive
  pipeline while still letting them try it.
- **Page limits** protect the part that actually costs money: every page is extracted, drawn
  and indexed.
- **Credits** are Heptabase's model, scaled to our lower price. Real AI costs per feature must
  be measured before launch (§4).

**Later, not now:** a team or education plan (Padlet earns heavily from school licences), and
credit top-up packs.

## 4. What a credit is

One credit ≈ one small AI action on a basic model. Premium models cost more. The weights,
which **must be calibrated against measured provider costs before launch**:

| Feature | Basic model | Premium model |
|---|---|---|
| Ask AI, Fill with AI (per request), Edit with AI, text actions | 1 | 5 |
| Readable transcript (per 10 passages) | 1 | 5 |
| Board AI chat message (+1 when board search is used) | 1 | 5 |
| Table from a document | 3 | 15 |
| Board wiki compile | 10 | 50 |
| PDF processing (extraction, page images) | 0 (limited by pages instead) | — |

A failed or refused AI call costs nothing: the credit is taken only after a successful answer.

## 5. What gets built, in order

1. **One source of truth for plans:** `lib/domain/billing/plans.ts`. Every limit in §3 lives
   there, and nothing is hard-coded elsewhere. `BillingPlan` gains `premium` (a migration). The
   Stripe checkout and webhook map two products (Pro, Premium) × two intervals.
2. **Plan-aware limits:**
   - PATCH-180's fixed limits become per-plan, read from the board owner's workspace;
   - the page limit per PDF;
   - the count of processed documents on Free;
   - uploads get a one-time upload link from the server, so a tampered browser can't bypass the
     plan;
   - the bucket's hard limit is set to the largest plan (1 GB).
3. **AI credits:**
   - a credit ledger per workspace (a migration), with a monthly allowance;
   - every AI route checks the balance before the call, and deducts after success;
   - a user's own key is exempt;
   - a clear "out of credits" state with an upgrade link.
4. **Model tier by plan:** the existing AI role resolver picks the model; the plan decides which
   models are allowed.
5. **The user sees it:**
   - a plan page;
   - usage meters ("312 of 500 credits", "3 of 5 documents");
   - upgrade prompts where a limit is hit.
6. **Before launch:** measure the real provider cost of each feature, and set the credit
   weights and allowances so every paid plan keeps a healthy margin.
