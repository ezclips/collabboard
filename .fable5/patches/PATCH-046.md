# PATCH-046 — hooks slice 9: retire the FreeformGraphRepo client hand-off (`createFreeformGraphRepo`; the class contract byte-kept; FreeformGraphLayer's legacy-client duality deferred by name)

**Status:** SPEC READY — implement exactly as bound below.
**Implementer:** GPT-5.4 acceptable (Pattern K, twenty-first application — one additive
factory + three line-neutral single-occurrence swaps, all extractor-applied).
**Authored:** 2026-07-11 at `fdfc67f` by the CTO (Fable 5). All censuses, hashes, and
simulation results below were measured fresh on that tree; the canonical files were
COMPILED AND RUN through the real repo gates before delegation (§0.6).

**Read first:** `.fable5/docs/SKILL.md`, `.fable5/docs/PATCH_REFERENCE.md` (§5.11
Pattern K), then this spec end to end. The LESSONS_LEARNED autocrlf rules apply:
never `git checkout/restore` a byte-fenced file; verify hashes ONLY with
`git hash-object`.

**Bound commit message (use EXACTLY, one commit):**

```
refactor(graph): retire the FreeformGraphRepo client hand-off via createFreeformGraphRepo -- 025 client identity, class contract byte-kept, CanvasClient raw construction extinct at never-grow equality, FreeformGraphLayer legacy-client duality deferred by name, hooks slice 9, Pattern K (PATCH-046)
```

---

## 0. CTO rulings and contract analysis

### 0.1 The ruling: FreeformGraphRepo is ALREADY the isolated seam — only its client hand-off is the strangler defect

`lib/graph/graphRepo.ts` is a pre-domain-layer class repository: isolated,
typed, P6-single, and OUTSIDE the boundary lint (like
`lib/workspace/context.ts`). It carries a rich graceful-degradation contract —
the `isTableUnavailable` instance state machine, `42P01`/does-not-exist
detection, synthetic fallback rows for upsertEdge/updateSettings, `PGRST116`
not-found tolerance on getSettings, and throw-through for every other error —
consumed by two component trees. **Result-translation is REJECTED**: it would
rewrite that entire contract at every consumer for zero strangler gain. The
ONLY strangler defect is that components construct the repo with THEIR OWN
client (`new FreeformGraphRepo(supabase, ...)`). This patch retires exactly
that: a one-line factory `createFreeformGraphRepo(boardId)` supplying the
client, and CanvasClient's construction swapped onto it. **The class body is
BYTE-KEPT** — the whole-file fence in §2 is a pure append (one import line +
the factory block); all five table sites, both console warnings, and the
state machine are untouched bytes (census-pinned: `.from(` 5→5,
`isTableUnavailable` 11→11).

### 0.2 Client identity (the 025 fact, re-verified at authoring)

CanvasClient's memo is `supabaseBrowser()` = `createClientComponentClient<any>()`
(lib/supabase/browser.ts); the factory supplies `createBrowserSupabaseClient()`
= `createClientComponentClient()` (lib/infra/supabase/browserClient.ts) — the
SAME auth-helpers cookie client every landed repository already uses alongside
that memo. Zero behavior change at the CanvasClient site.

### 0.3 FreeformGraphLayer: DEFERRED BY NAME (do NOT touch)

The second constructor site, `components/graph/FreeformGraphLayer.tsx` L40,
passes a DIFFERENT client: the LEGACY `lib/supabase.ts` singleton — the exact
`lib/supabase` vs `lib/supabase/browser` session-identity duality the
useCanvasData header warns about. Swapping it onto the cookie-client factory
would CHANGE its RLS session identity — a behavior change requiring an owner
client-identity ruling. The component is rendered by FreeformPadletCards
(LAST in the standing sequencing), so the question rides that phase. The
factory's doc comment fences it; `FreeformGraphLayer.tsx` is MUST-NOT-CHANGE
below (hash-bound).

### 0.4 Scope notes

- The `supabase` entry in the connect-effect deps array is removed WITH the
  construction it served (line-neutral; the effect body's only client use was
  that construction — verified by scan). The OTHER stale `supabase` dep at
  `commitPadletMeta` predates this patch and is NOT touched (out of seam).
- postsRaw stays per-consumer (untouched); realtime stays CTO-only
  (untouched); `types/graphTypes.ts` untouched.
- NO tests: the factory is a one-line builder return (the 021/042
  precedent); the class body is byte-kept and fence-proven. Suite stays
  **245/28**.
- CanvasClient: 8,384 → **8,384** — all three swaps are line-neutral;
  never-grow holds at equality. Edited ONLY by the bound extractor.

### 0.5 Instrument disclosures

- `createFreeformGraphRepo` CONTAINS the substring `FreeformGraphRepo`, so
  the raw-construction extinction instrument is `new FreeformGraphRepo`
  (CanvasClient 1→0); the bare `FreeformGraphRepo` count stays 2→2 there
  (the 042 substring-counting class).
- CanvasClient `supabase` 29→27 (the construction line + the deps entry).
- graphRepo.ts gains its OWN `new FreeformGraphRepo` (0→1: the factory body).

### 0.6 Simulation results (CTO, in-tree, this exact canonical content)

tsc `--noEmit` CLEAN; `npm run check:boundaries` SILENT; vitest
**245 passed (245), 28 files** — unchanged, zero pins broken. Tree restored
byte-exact via `git cat-file blob` + no-op `git add`.

### 0.7 One slice, no split

Two files, one seam. PATCH-047 is NOT drafted.

---

## 1. Pre-edit bindings (verify FIRST; any mismatch = STOP, report, do not improvise)

```bash
git status --short   # nothing
git hash-object lib/graph/graphRepo.ts                        # e5cb00d4269c012b1d936c6089bf3bb0489a13b1   (169 lines)
git hash-object "app/dashboard/canvas/[id]/CanvasClient.tsx"  # 620cc9ac1ad0c528a0c1660c7b2ab8e9f6c66662   (8,384 lines)
```

MUST-NOT-CHANGE set (verify now AND after — all twelve):

```bash
git hash-object types/graphTypes.ts                                          # b11bce9b29c4eff5579afd9d1eb8d0cd0fb7c046
git hash-object components/graph/FreeformGraphLayer.tsx                      # 63fc5334c6cc6633592735435f6992d5607c9481
git hash-object lib/infra/supabase/browserClient.ts                          # f91afd33c8395fab3c83a0ffd0cc33d3b8b1c665
git hash-object lib/supabase.ts                                              # 067dfb401e6eb1774500157d88a7bc55f0eec29c
git hash-object lib/supabase/browser.ts                                      # b42aa22e7921b6aeea02515bc8897a7906bb8caa
git hash-object components/collabboard/canvas/hooks/useCanvasData.ts         # 3cc658c61cf7676d609b842281e59643b68da6a4
git hash-object components/collabboard/canvas/hooks/useCanvasLines.ts        # 8a7459966d5ed2e74f873e0ff9fd0e8e7557fb3c
git hash-object lib/domain/canvas/lines.ts                                   # 96594d2d8b7dc4fee04a641e5ae9f5ff4d488fe5
git hash-object lib/infra/canvas/linesRepository.ts                          # 1bb11907dfe58ed5ab116f94936304e9ca2ea1be
git hash-object lib/infra/canvas/canvasViewReads.ts                          # a57714002bd65ea493776904ca01748d64bf3bed
git hash-object lib/infra/supabase/workspaceMembers.ts                       # 8d62ca5e5f33c5df5faa8407cb9d4b5fc8dbdd57
git hash-object lib/domain/core/command.ts                                   # 2e034d8d89acdade824c6f62751996961a8837d9
```

Pre-edit censuses (plain `grep -c`, case-sensitive, LINE counts):

```bash
C="app/dashboard/canvas/[id]/CanvasClient.tsx"
grep -c "new FreeformGraphRepo" "$C"        # 1
grep -c "createFreeformGraphRepo" "$C"      # 0
grep -c "FreeformGraphRepo" "$C"            # 2   (import + construction)
grep -c "supabase" "$C"                     # 29
G=lib/graph/graphRepo.ts
grep -c "\.from(" "$G"                      # 5
grep -c "isTableUnavailable" "$G"           # 11
grep -c "createBrowserSupabaseClient" "$G"  # 0
grep -c "createFreeformGraphRepo" "$G"      # 0
grep -c "new FreeformGraphRepo" "$G"        # 0
```

Collision gate (repo-wide, MUST be 0 pre-edit):

```bash
grep -rn "createFreeformGraphRepo" --include="*.ts" --include="*.tsx" lib components app | grep -v node_modules | wc -l   # 0
```

---

## 2. BOUND FILE — `lib/graph/graphRepo.ts` (whole file, exact, 183 lines; post-edit hash `cab52c166254ebfc85a1c414739f556c95bdeef9`)

```ts
import { SupabaseClient } from '@supabase/supabase-js';
import type { FreeformGraphEdge, FreeformGraphSettings } from '../../types/graphTypes';
import { createBrowserSupabaseClient } from '../infra/supabase/browserClient';

/**
 * Isolated repository for Freeform Graph data operations.
 * Operates strictly on the new tables: freeform_graph_edges, freeform_graph_settings.
 */
export class FreeformGraphRepo {
    private isTableUnavailable = false;

    constructor(private supabase: SupabaseClient, private boardId: string) { }

    private isMissingRelationError(error: unknown): boolean {
        const err = error as { code?: string; message?: string } | null;
        return err?.code === '42P01' || String(err?.message || '').includes('does not exist');
    }

    private normalizeRelationType(value: unknown): FreeformGraphEdge['relation_type'] {
        return value === 'solid' || value === 'dashed' || value === 'dotted' ? value : 'solid';
    }

    private normalizeDirection(value: unknown): FreeformGraphEdge['direction'] {
        return value === 'none' || value === 'forward' || value === 'backward' || value === 'bidirectional'
            ? value
            : 'forward';
    }

    private normalizeLayoutMode(value: unknown): FreeformGraphSettings['layout_mode'] {
        return value === 'auto' || value === 'manual' ? value : 'manual';
    }

    async getEdges(): Promise<FreeformGraphEdge[]> {
        if (this.isTableUnavailable) return [];

        const { data, error } = await this.supabase
            .from('freeform_graph_edges')
            .select('*')
            .eq('board_id', this.boardId);

        if (error && this.isMissingRelationError(error)) {
            this.isTableUnavailable = true;
            console.warn('[FreeformGraphRepo] freeform_graph_edges table unavailable (missing or RLS error):', error);
            return [];
        }
        if (error) throw error;
        console.debug('[FreeformGraphRepo] getEdges returned', (data || []).length, 'edges for board', this.boardId);
        return data || [];
    }

    async getSettings(): Promise<FreeformGraphSettings | null> {
        if (this.isTableUnavailable) return null;

        const { data, error } = await this.supabase
            .from('freeform_graph_settings')
            .select('*')
            .eq('board_id', this.boardId)
            .single();

        if (error && this.isMissingRelationError(error)) {
            this.isTableUnavailable = true;
            return null;
        }
        if (error && error.code !== 'PGRST116') throw error; // PGRST116 is not found
        return data;
    }

    async upsertEdge(edgeData: Partial<FreeformGraphEdge>): Promise<FreeformGraphEdge> {
        if (!edgeData.id) throw new Error("FreeformGraphRepo: upsertEdge requires an id");
        if (!edgeData.board_id) throw new Error("FreeformGraphRepo: upsertEdge requires board_id");

        // Explicit bounds checking
        if (edgeData.relation_type && !['solid', 'dashed', 'dotted'].includes(edgeData.relation_type)) {
            throw new Error(`FreeformGraphRepo: Invalid relation_type ${edgeData.relation_type}`);
        }

        if (this.isTableUnavailable) {
            return {
                id: edgeData.id,
                board_id: edgeData.board_id,
                source_post_id: edgeData.source_post_id || '',
                target_post_id: edgeData.target_post_id || '',
                relation_type: this.normalizeRelationType(edgeData.relation_type),
                direction: this.normalizeDirection(edgeData.direction),
                label: edgeData.label ?? null,
                style: edgeData.style ?? null,
                created_at: edgeData.created_at || new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
        }

        const { data, error } = await this.supabase
            .from('freeform_graph_edges')
            .upsert({ ...edgeData, updated_at: new Date().toISOString() })
            .select()
            .single();

        if (error && this.isMissingRelationError(error)) {
            this.isTableUnavailable = true;
            console.warn('[FreeformGraphRepo] upsertEdge failed - table unavailable. Edge was NOT saved to DB:', error);
            return {
                id: edgeData.id,
                board_id: edgeData.board_id,
                source_post_id: edgeData.source_post_id || '',
                target_post_id: edgeData.target_post_id || '',
                relation_type: this.normalizeRelationType(edgeData.relation_type),
                direction: this.normalizeDirection(edgeData.direction),
                label: edgeData.label ?? null,
                style: edgeData.style ?? null,
                created_at: edgeData.created_at || new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
        }
        if (error) throw error;
        return data;
    }

    async deleteEdge(edgeId: string): Promise<void> {
        if (this.isTableUnavailable) return;

        const { error } = await this.supabase
            .from('freeform_graph_edges')
            .delete()
            .eq('id', edgeId)
            .eq('board_id', this.boardId);

        if (error && this.isMissingRelationError(error)) {
            this.isTableUnavailable = true;
            return;
        }
        if (error) throw error;
    }

    async updateSettings(settings: Partial<FreeformGraphSettings>): Promise<FreeformGraphSettings> {
        if (this.isTableUnavailable) {
            return {
                board_id: this.boardId,
                layout_mode: this.normalizeLayoutMode(settings.layout_mode),
                focus_node_id: settings.focus_node_id ?? null,
                show_minimap: settings.show_minimap ?? false,
                snap_strength: settings.snap_strength ?? 0.5,
                updated_at: new Date().toISOString(),
            };
        }

        const { data, error } = await this.supabase
            .from('freeform_graph_settings')
            .upsert({
                board_id: this.boardId,
                ...settings,
                updated_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error && this.isMissingRelationError(error)) {
            this.isTableUnavailable = true;
            return {
                board_id: this.boardId,
                layout_mode: this.normalizeLayoutMode(settings.layout_mode),
                focus_node_id: settings.focus_node_id ?? null,
                show_minimap: settings.show_minimap ?? false,
                snap_strength: settings.snap_strength ?? 0.5,
                updated_at: new Date().toISOString(),
            };
        }
        if (error) throw error;
        return data;
    }
}

/**
 * PATCH-046: the client hand-off retirement. Consumers stop constructing
 * the repo with their own client - this factory supplies the SAME
 * cookie/browser client CanvasClient's memo passed (the PATCH-025 client
 * identity). FreeformGraphLayer (rendered by FreeformPadletCards) still
 * constructs with the LEGACY lib/supabase singleton and is deferred BY
 * NAME to that phase - do NOT swap it onto this factory without an owner
 * client-identity ruling.
 */
export function createFreeformGraphRepo(boardId: string): FreeformGraphRepo {
    return new FreeformGraphRepo(createBrowserSupabaseClient(), boardId);
}
```

---

## 3. BOUND CanvasClient REGIONS (EXTRACTOR INPUT — the 2nd through 7th ts fences in spec order, indices 1 through 6 in Phase B's zero-indexed fence list; each OLD occurs EXACTLY ONCE; applied mechanically by Phase B, never by hand)

CanvasClient gets NO whole-file fence (8,384 lines, over-ceiling). The
extractor asserts the pre-edit hash, applies these three line-neutral
replacements, and asserts the final hash
`7acfa197623e39a8462adca29a321a9e64a12689` (8,384 lines — never-grow at
equality).

### 3.1 The import swap

OLD:

```ts
import { FreeformGraphRepo } from '@/lib/graph/graphRepo';
```

NEW:

```ts
import { createFreeformGraphRepo } from '@/lib/graph/graphRepo';
```

### 3.2 The construction swap (the client hand-off dies)

OLD:

```ts
        const repo = new FreeformGraphRepo(supabase, canvasId.toString());
```

NEW:

```ts
        const repo = createFreeformGraphRepo(canvasId.toString());
```

### 3.3 The connect-effect deps (the entry that served the construction)

OLD:

```ts
  }, [isFreeformGraphMode, isGraphConnectMode, canvasId, graphConnectSelection, graphConnectSource, padlets, supabase]);
```

NEW:

```ts
  }, [isFreeformGraphMode, isGraphConnectMode, canvasId, graphConnectSelection, graphConnectSource, padlets]);
```

---

## 4. Phase plan

### Phase A — read + verify

Read SKILL.md, PATCH_REFERENCE §5.11, this spec. Run EVERY §1 gate. Any
mismatch: STOP and report; do not improvise.

### Phase B — the bound mechanical extractor (the ONLY write step)

Save the block below as `_p046_extract.py` (repo root) and run
`python3 _p046_extract.py`; then DELETE the script file. Do not hand-edit any
scoped file; if the extractor stops, report its output verbatim.

```python
import hashlib, re, subprocess

def blob(data: bytes) -> str:
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()

spec = open(".fable5/patches/PATCH-046.md", encoding="utf-8", newline="").read()
assert "\r" not in spec, (
    "your spec copy is CRLF-smudged; re-read it via "
    "git cat-file blob HEAD:.fable5/patches/PATCH-046.md"
)
TICKS = chr(96) * 3  # the fence delimiter, built without backtick
# literals so ANY extraction method survives this script intact.
fences = re.findall(TICKS + "ts\n(.*?)" + TICKS, spec, re.DOTALL)

path = "lib/graph/graphRepo.ts"
want = "cab52c166254ebfc85a1c414739f556c95bdeef9"
content = fences[0]
got = blob(content.encode("utf-8"))
assert got == want, f"fence 0 hashes to {got}, expected {want} - STOP, report"
with open(path, "w", encoding="utf-8", newline="") as f:
    f.write(content)
check = subprocess.run(["git", "hash-object", path], capture_output=True, text=True).stdout.strip()
assert check == want, f"{path}: git hash-object {check} != {want} - STOP, report"
print(path, check, "OK")

cc_path = "app/dashboard/canvas/[id]/CanvasClient.tsx"
pre = subprocess.run(["git", "hash-object", cc_path], capture_output=True, text=True).stdout.strip()
assert pre == "620cc9ac1ad0c528a0c1660c7b2ab8e9f6c66662", f"CanvasClient pre-edit {pre} - STOP, report"
cc = open(cc_path, encoding="utf-8", newline="").read()
assert "\r" not in cc, (
    "CanvasClient working copy is CRLF-smudged; restore it via "
    "git cat-file blob HEAD (binary write), never git checkout, then rerun"
)
for j in range(3):
    old, new = fences[1 + 2 * j], fences[2 + 2 * j]
    n = cc.count(old)
    assert n == 1, f"CanvasClient region {j + 1} occurrence count {n} - STOP, report"
    cc = cc.replace(old, new)
with open(cc_path, "w", encoding="utf-8", newline="") as f:
    f.write(cc)
post = subprocess.run(["git", "hash-object", cc_path], capture_output=True, text=True).stdout.strip()
assert post == "7acfa197623e39a8462adca29a321a9e64a12689", f"CanvasClient final {post} - STOP, report"
print(cc_path, post, "OK")
print("BOTH SCOPED FILES WRITTEN AND HASH-VERIFIED")
```

### Phase C — gates (§6), commit (bound message), STOP

Do not start PATCH-047.

---

## 5. Explanatory recipe — graphRepo.ts is a pure append (REFERENCE ONLY)

The §2 fence differs from the pre-edit file by exactly: this one import line
change —

OLD:

```ts
import { SupabaseClient } from '@supabase/supabase-js';
import type { FreeformGraphEdge, FreeformGraphSettings } from '../../types/graphTypes';
```

NEW:

```ts
import { SupabaseClient } from '@supabase/supabase-js';
import type { FreeformGraphEdge, FreeformGraphSettings } from '../../types/graphTypes';
import { createBrowserSupabaseClient } from '../infra/supabase/browserClient';
```

— plus ONE blank separator line and then this block appended at end of file
(the reconstruction is: apply the import swap, then append `"\n"` + the block
below to the pre-edit file's final `}\n`):

```ts
/**
 * PATCH-046: the client hand-off retirement. Consumers stop constructing
 * the repo with their own client - this factory supplies the SAME
 * cookie/browser client CanvasClient's memo passed (the PATCH-025 client
 * identity). FreeformGraphLayer (rendered by FreeformPadletCards) still
 * constructs with the LEGACY lib/supabase singleton and is deferred BY
 * NAME to that phase - do NOT swap it onto this factory without an owner
 * client-identity ruling.
 */
export function createFreeformGraphRepo(boardId: string): FreeformGraphRepo {
    return new FreeformGraphRepo(createBrowserSupabaseClient(), boardId);
}
```

Nothing else. Every byte of the class body is identical to the pre-edit file.

---

## 6. Post-edit gates (ALL must pass before commit)

### 6.1 Hashes

```bash
git hash-object lib/graph/graphRepo.ts                        # cab52c166254ebfc85a1c414739f556c95bdeef9
git hash-object "app/dashboard/canvas/[id]/CanvasClient.tsx"  # 7acfa197623e39a8462adca29a321a9e64a12689
```

Plus ALL TWELVE MUST-NOT-CHANGE hashes from §1, unchanged.

### 6.2 Censuses (simulation-measured; plain `grep -c`)

```bash
C="app/dashboard/canvas/[id]/CanvasClient.tsx"
grep -c "new FreeformGraphRepo" "$C"        # 0   (raw construction EXTINCT)
grep -c "createFreeformGraphRepo" "$C"      # 2   (import + call)
grep -c "FreeformGraphRepo" "$C"            # 2   (substring of the factory name — the 042 disclosure class)
grep -c "supabase" "$C"                     # 27
wc -l "$C"                                  # 8384   (never-grow at EQUALITY)
G=lib/graph/graphRepo.ts
grep -c "\.from(" "$G"                      # 5   (all five table sites byte-kept)
grep -c "isTableUnavailable" "$G"           # 11  (the state machine byte-kept)
grep -c "createBrowserSupabaseClient" "$G"  # 2   (import + factory body)
grep -c "createFreeformGraphRepo" "$G"      # 1
grep -c "new FreeformGraphRepo" "$G"        # 1   (the factory's own construction)
wc -l "$G"                                  # 183
```

### 6.3 Scope + untouched gates

```bash
git status --short   # exactly TWO modified paths; ANY other path = STOP
git diff --stat -- types/graphTypes.ts components/graph lib/supabase.ts lib/supabase lib/infra lib/domain components/collabboard eslint.boundaries.config.mjs   # nothing
```

### 6.4 Execution gates

```bash
npx tsc --noEmit                          # clean
npm run check:boundaries                  # silent
npx vitest run                            # 245 passed (245), 28 files
# port gate: nothing listens on 3000 before you start; own dev server; warm /, /auth, /dashboard;
PW_BASE_URL=http://localhost:3000 npx playwright test   # 27 passed
# stop the server by PID; port 3000 back to 0 listeners; then:
rm -rf .next && npm run verify            # exit 0
```

Commit with the bound message. Do NOT start PATCH-047.

---

## 7. Do NOT

- Do NOT touch `components/graph/FreeformGraphLayer.tsx` — its LEGACY
  lib/supabase client is a deferred-by-name duality awaiting an owner
  ruling in the FreeformPadletCards phase (§0.3).
- Do NOT translate the class to Result/commands, alter its
  graceful-degradation state machine, its synthetic fallbacks, its console
  warnings, or its throw-through channels — the class body is byte-kept.
- Do NOT touch the stale `supabase` dep at commitPadletMeta (out of seam).
- Do NOT hand-edit CanvasClient — Phase B's extractor is the only writer;
  never-grow must land at exactly 8,384.
- Do NOT run `git checkout` / `git restore` on any scoped file (autocrlf).
- Do NOT print or read `.env.local` values.
- Do NOT start PATCH-047.
