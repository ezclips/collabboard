import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * R6B, group F -- the wiring, and the one property the whole slice exists to
 * hold: a crop of a private Knowledge PDF is never published.
 *
 * Source invariants, in the style this repo already uses for CanvasClient:
 * they pin call shapes and ordering, not formatting.
 */

/** Line comments only -- a block strip would swallow JSX and fake passes. */
function sourceOf(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8').replace(/^\s*\/\/.*$/gm, '');
}

const selector = sourceOf('components/collabboard/KnowledgeDocumentPageRegionSelector.tsx');
const canvasClient = sourceOf('app/dashboard/canvas/[id]/CanvasClient.tsx');

const R6B_FILES = [
  'lib/domain/knowledge/knowledgeSourceClipPayload.ts',
  'lib/domain/knowledge/knowledgePdfAreaImagePolicy.ts',
  'lib/server/knowledge/knowledgePdfAreaImageRoute.ts',
  'lib/server/knowledge/knowledgePdfAreaImageServeRoute.ts',
  'lib/infra/knowledge/knowledgePdfAreaImageClient.ts',
  'app/api/boards/[id]/knowledge/area-image/route.ts',
  'app/api/boards/[id]/padlets/[padletId]/image/route.ts',
  'components/collabboard/KnowledgeDocumentPageRegionSelector.tsx',
] as const;

function after(source: string, anchor: string, count = 900): string {
  const index = source.indexOf(anchor);
  expect(index, `anchor not found: ${anchor}`).toBeGreaterThan(-1);
  return source.slice(index, index + count);
}

describe('F1-F5: the selected area is itself the drag source', () => {
  it('F1: the armed rectangle is draggable and grabbable, not an inert overlay', () => {
    const rectangle = after(selector, 'data-knowledge-region-rectangle={pageNumber}', 3600);
    expect(rectangle).toContain('draggable={draggableRegion}');
    expect(rectangle).toContain('onDragStart={draggableRegion ? startAreaClipDrag : undefined}');
    expect(rectangle).toContain('cursor-grab');
  });

  it('F2: pressing it does not restart a selection underneath it', () => {
    // The crosshair layer treats any press as a NEW rectangle and clears the
    // armed one, which would destroy the thing being dragged.
    const rectangle = after(selector, 'data-knowledge-region-rectangle={pageNumber}', 3600);
    expect(rectangle).toContain('onPointerDown={draggableRegion ? (event) => event.stopPropagation() : undefined}');
    expect(selector).toContain('if (armedRegion !== null) onClear();');
  });

  it('F3: only a settled rectangle drags -- mid-drag there is no answer yet', () => {
    expect(selector).toContain('const draggableRegion = enabled && armedRegion !== null && live === null;');
    // An unarmed rectangle keeps its old inert behaviour exactly.
    const rectangle = after(selector, 'data-knowledge-region-rectangle={pageNumber}', 3600);
    expect(rectangle).toContain("draggableRegion ? 'cursor-grab active:cursor-grabbing' : 'pointer-events-none'");
  });

  it('F4: it publishes the area arm on the ONE dedicated type, via the shared builder', () => {
    const dragStart = after(selector, 'const startAreaClipDrag = (', 2400);
    expect(dragStart).toContain('event.dataTransfer.setData(');
    expect(dragStart).toContain('KNOWLEDGE_SOURCE_CLIP_MIME');
    expect(dragStart).toContain('buildKnowledgeSourceClipTransfer({');
    expect(dragStart).toContain("kind: 'area'");
    expect(dragStart).toContain('region: armedRegion');
    // R6I. The drag now also prepares a local preview for the creation modal.
    // It must stay OFF the transfer: crop bytes on a DataTransfer would make a
    // private PDF reconstructible from a drag, which is the whole reason this
    // payload is identity-and-a-rectangle in the first place.
    const setData = dragStart.slice(dragStart.indexOf('event.dataTransfer.setData('));
    for (const forbidden of ['stashKnowledgeAreaDraftPreview', 'renderAreaPreviewFromImage', 'toDataURL', 'data:image']) {
      expect(setData, forbidden).not.toContain(forbidden);
    }
    // The constant, never a re-typed literal that could drift.
    expect(selector).not.toContain("'application/collabboard-knowledge-clip'");
    // text/plain accompanies every drag on the system; honouring it anywhere
    // would let arbitrary dropped text forge a clip.
    expect(dragStart).not.toContain('text/plain');
  });

  it('F5: the reader publishes no bytes and learns nothing about the canvas', () => {
    const dragStart = after(selector, 'const startAreaClipDrag = (', 1200);
    for (const forbidden of ['toDataURL', 'toBlob', 'canvas', 'fetch(', 'base64', 'storagePath']) {
      expect(dragStart, forbidden).not.toContain(forbidden);
    }
    for (const forbidden of ['padlets', 'board_id', 'position_x', 'getCanvasPointFromClient', '.insert(']) {
      expect(selector, forbidden).not.toContain(forbidden);
    }
  });
});

/** R6I. The drop handler -- which now only stages a draft. */
function areaDropHandler(): string {
  return after(canvasClient, 'const handleKnowledgePdfAreaClipDrop = useCallback(', 2600);
}

/** R6I. The Save path -- the only place that creates anything. */
function areaSavePath(): string {
  return after(canvasClient, 'const savePdfAreaDraft = useCallback(', 2400);
}

describe('F6-F10: the canvas asks the server, and claims the drop exactly once', () => {
  it('F6: the area arm is checked ahead of the text arm at EVERY drop site', () => {
    const areaSites = canvasClient.match(/if \(handleKnowledgePdfAreaClipDrop\(e\)\) return;/g) ?? [];
    const textSites = canvasClient.match(/if \(handleKnowledgeSourceClipDrop\(e\)\) return;/g) ?? [];
    expect(areaSites.length).toBe(textSites.length);
    expect(areaSites.length).toBeGreaterThan(0);
    // And each area check literally precedes its text check.
    let cursor = 0;
    for (let i = 0; i < areaSites.length; i += 1) {
      const area = canvasClient.indexOf('if (handleKnowledgePdfAreaClipDrop(e)) return;', cursor);
      const text = canvasClient.indexOf('if (handleKnowledgeSourceClipDrop(e)) return;', cursor);
      expect(area).toBeGreaterThan(-1);
      expect(text).toBeGreaterThan(area);
      cursor = text + 1;
    }
  });

  it('F7: it claims the drop synchronously, before anything can await', () => {
    const handler = areaDropHandler();
    const parse = handler.indexOf('parseKnowledgeSourceAreaClipPayload(');
    const bail = handler.indexOf('if (!payload) return false;');
    const stop = handler.indexOf('event.stopPropagation();');
    expect(bail).toBeGreaterThan(parse);
    expect(stop).toBeGreaterThan(bail);
    // R6I made this stronger rather than weaker: the drop stages a draft and
    // returns, so there is no await on this path at all and nothing can be
    // deferred past the event's lifetime.
    expect(handler).not.toContain('await ');
    // The drop point is still read while the event is live.
    expect(handler).toContain('getCanvasPointFromClient(event.clientX, event.clientY)');
  });

  it('F8: it re-checks the creation capability rather than trusting the drag', () => {
    // A viewer can synthesise a DataTransfer, so the surface that writes must
    // authorise -- the absent grip is not a permission check.
    const handler = after(canvasClient, 'const handleKnowledgePdfAreaClipDrop = useCallback(', 2200);
    expect(handler).toContain('if (!canUseCanvasToolbar || !canvasId) return true;');
    // Claimed regardless, so a refusal cannot fall through to another handler.
    expect(handler).toContain('return true;');
  });

  it('F9: it reads only the dedicated type and creates nothing itself', () => {
    const handler = areaDropHandler();
    expect(handler).toContain('event.dataTransfer.getData(KNOWLEDGE_SOURCE_CLIP_MIME)');
    expect(handler).not.toContain('text/plain');
    // R6I. The drop creates NOTHING -- not even through the transport helper.
    // It stages a draft and opens the ordinary creation modal.
    expect(handler).not.toContain('requestKnowledgePdfAreaImage(');
    expect(handler).toContain('setPendingPdfAreaDraft({ payload, placement, preview })');
    for (const forbidden of ['.insert(', '.upload(', 'getPublicUrl', 'storageGateway', 'toDataURL']) {
      expect(handler, forbidden).not.toContain(forbidden);
    }
    // ...and the one transport helper is still the only way anything is made,
    // now on the Save path.
    const save = areaSavePath();
    expect(save).toContain('requestKnowledgePdfAreaImage(');
    for (const forbidden of ['.insert(', '.upload(', 'getPublicUrl', 'storageGateway']) {
      expect(save, forbidden).not.toContain(forbidden);
    }
  });

  it('F10: a refusal places nothing, and only tells the user', () => {
    // R6I. The refusal now lives with the create, on the Save path.
    const save = areaSavePath();
    const refusal = save.indexOf('if (!created.ok)');
    // The placement write reconciles by id rather than appending blindly, so a
    // repeated Done for one draft converges on the row the idempotent RPC
    // returns instead of listing the same id twice. The ordering this test
    // exists for -- refuse, then place, then close -- is unchanged.
    const place = save.indexOf('const createdPadlet = created.padlet');
    expect(refusal).toBeGreaterThan(-1);
    expect(place).toBeGreaterThan(refusal);
    expect(save).toContain('toast.error(');
    // A refusal must leave the draft alone so the user can retry: the modal is
    // only closed after a successful create.
    // R6I-C1: the modal renders off the draft, so clearing it is the close.
    const close = save.indexOf('setPendingPdfAreaDraft(null)');
    expect(close).toBeGreaterThan(place);
    expect(save.slice(refusal, place)).not.toContain('setPendingPdfAreaDraft(null)');
  });
});

describe('F11-F13: nothing in this slice can publish a crop', () => {
  it('F11: no R6B file names a public bucket or mints a public/signed URL', () => {
    for (const file of R6B_FILES) {
      const source = sourceOf(file);
      for (const forbidden of ["'padlet-files'", '"padlet-files"', "from('images')", "from('thumbnails')",
        'getPublicUrl', 'createSignedUrl', 'storage/v1/object/public']) {
        expect(source, `${file} must not ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('F12: no R6B file reaches into the PDF worker or a second image stack', () => {
    // The worker isolation rule: PDF.js lives only in workers/knowledge-pdf.
    for (const file of R6B_FILES) {
      const source = sourceOf(file).toLowerCase();
      for (const forbidden of ['workers/knowledge-pdf', 'pdfjs', 'pdf.js', 'html2canvas',
        'tesseract', 'puppeteer', 'playwright']) {
        expect(source, `${file} must not use ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('F13: this slice adds no migration and no new bucket', () => {
    // The crop lives in the bucket the PDF already lives in, so R6B needed no
    // schema change at all -- provenance rides in the existing metadata jsonb.
    //
    // IMAGE-LIBRARY-1 later added ONE reviewed RPC here, so that a saved Image
    // Post gets its durable Library object and its board placement in a single
    // transaction. `rpc(` is therefore no longer forbidden; everything this
    // guard exists to prevent -- creating or widening a bucket, and running DDL
    // from the request path -- still is.
    const server = sourceOf('lib/server/knowledge/knowledgePdfAreaImageRoute.ts');
    expect(server).toContain('KNOWLEDGE_STORAGE_BUCKET');
    for (const forbidden of ['createBucket', 'updateBucket', 'alter table', 'ALTER TABLE']) {
      expect(server, forbidden).not.toContain(forbidden);
    }
    // The one RPC it may call, and no other. It is the PDF-area wrapper rather
    // than the generic image function: only that one records where the private
    // crop lives, which is what lets the Library object keep a picture after
    // this placement is deleted. The generic function stays reachable by
    // `authenticated`, so it must never be the one that writes a location.
    expect(server.match(/\.rpc\(/g) ?? []).toHaveLength(1);
    expect(server).toContain(
      "adminClient.rpc('create_knowledge_pdf_area_image_post_with_library_item'");
    // The route sends structural inputs only: no storage path leaves this file,
    // in any argument name, so the location can never become client input.
    for (const forbidden of ['p_durable_object_path', 'p_storage_path', 'board-derived/']) {
      expect(server, forbidden).not.toContain(forbidden);
    }
  });
});

/**
 * F14-F22: the durable-preview SQL contract.
 *
 * The rollout and its verifier are release-critical and cannot be exercised by
 * vitest, so the properties a reviewer would otherwise have to take on trust --
 * or rediscover by running a disposable database by hand -- are pinned here.
 * Each assertion names a defect that would otherwise ship silently.
 */
describe('F14-F22: durable Library preview SQL contract', () => {
  const migration = sourceOf('supabase/migrations/20260907120000_library_durable_image_preview.sql');
  const rollout = sourceOf('supabase/production-rollouts/20260907120000_library_durable_image.sql');
  const verifier = sourceOf('supabase/production-rollouts/20260907120000_library_durable_image_verify.sql');
  const CANONICAL_UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
  const REPAIR = rollout.slice(rollout.indexOf('WITH hint AS ('), rollout.indexOf('-- 5. Postflight'));

  it('F14: durable state never requires a live origin placement', () => {
    // The feature IS "the object outlives its placements". A postflight or
    // verifier that joins a durable row back to `padlets` fails exactly when
    // the correction starts working, so neither may do it.
    const rolloutDurable = rollout.slice(rollout.indexOf('-- 5. Postflight'));
    expect(rolloutDurable).toContain('knowledge_storage_path IS NOT NULL');
    expect(rolloutDurable, 'postflight must not join padlets for a durable row')
      .not.toContain('p.library_item_id = li.id');
    expect(verifier, 'verifier must not join padlets for a durable row')
      .not.toContain('p.library_item_id = li.id');
    // And the intent is stated where the next reader will look.
    expect(rollout).toContain('SURVIVE placement deletion');
    expect(verifier).toContain('DELIBERATELY DOES NOT CHECK');
  });

  it('F15: the legacy hint is parsed with a canonical UUID shape before any cast', () => {
    // A loose [0-9a-fA-F-]{36} class admits malformed strings that then abort
    // the whole transaction on ::uuid -- turning a forged client-owned URL into
    // a denial of the entire rollout.
    expect(REPAIR).toContain(CANONICAL_UUID);
    expect(REPAIR).not.toContain('[0-9a-fA-F-]{36}');
    // The cast happens in a later CTE, only after the strict match succeeded.
    // Comments are stripped first: this is a claim about executed SQL, and the
    // hint CTE's own prose mentions the very cast it must not perform.
    const executable = REPAIR.replace(/^\s*--.*$/gm, '');
    const candidateAt = executable.indexOf('candidate AS (');
    expect(candidateAt).toBeGreaterThan(0);
    expect(executable.slice(0, candidateAt), 'no cast may run inside the hint CTE')
      .not.toContain('::uuid');
    expect(executable.slice(candidateAt)).toContain('h.board_text::uuid');
  });

  it('F16: provenance is validated through one mirror of the canonical parser', () => {
    // Checking source.kind alone would accept a row the reader later rejects.
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.is_knowledge_pdf_area_provenance');
    for (const field of ['knowledgeDocumentId', 'pageNumber', 'region', "'x'", "'y'", "'width'", "'height'"]) {
      expect(migration, field).toContain(field);
    }
    // Never NULL and never throwing: a NULL conjunct in a security predicate
    // reads as "not false", and an exception aborts the whole rollout.
    expect(migration).toContain('RETURNS boolean');
    expect(migration).toContain('WHEN others THEN');
    // Both sides of the join are validated, not just the Library snapshot.
    expect(REPAIR).toContain("public.is_knowledge_pdf_area_provenance(li.content -> 'metadata')");
    expect(REPAIR).toContain('public.is_knowledge_pdf_area_provenance(p.metadata)');
  });

  it('F17: the hint is proved by structural join, never believed', () => {
    for (const proof of [
      'p.id = c.padlet_id',
      'p.board_id = c.board_id',
      'p.library_item_id = c.id',
      "p.type = 'image'",
      "p.metadata -> 'source' ->> 'knowledgeDocumentId' = c.document_id",
    ]) {
      expect(REPAIR, proof).toContain(proof);
    }
  });

  it('F18: neither creation retry nor legacy repair can downgrade a composite', () => {
    // resolveLibraryImagePreviewSrc reads thumbnail_url and content.file_url
    // ABOVE metadata.drawing/previewUrl, so repointing those two fields on a
    // row that carries either would hide the current picture behind the crop.
    for (const [name, sql] of [['migration', migration], ['rollout', rollout]] as const) {
      expect(sql, name).toContain("content -> 'metadata' ->> 'drawing' IS NULL");
      expect(sql, name).toContain("content -> 'metadata' ->> 'previewUrl' IS NULL");
    }
    // The repair guards it in the candidate set AND again at write time.
    expect((REPAIR.match(/->> 'drawing' IS NULL/g) ?? []).length).toBeGreaterThanOrEqual(2);
    // And the verifier proves after the fact that none was downgraded.
    expect(verifier).toContain('no composite row was repointed to the original crop');
  });

  it('F19: every verifier section is an explicit boolean', () => {
    // A NULL `pass` is not a failure to a human skim-reading the output.
    const sections = verifier.split('\nSELECT ').slice(1);
    expect(sections.length).toBeGreaterThanOrEqual(12);
    for (const section of sections) {
      const head = section.slice(0, section.indexOf(' AS pass'));
      if (section.indexOf(' AS pass') < 0) continue;
      expect(head.includes('COALESCE') || head.includes('true AS pass') || head.includes('true'),
        'section "' + section.slice(0, 50) + '" must fail closed').toBe(true);
    }
    // The empty-grant case aggregates to NULL and must be defended explicitly.
    expect(verifier).toContain('ARRAY[]::text[]');
  });

  it('F20: the release gate repeats every load-bearing condition', () => {
    const rollup = verifier.slice(verifier.indexOf('12 AS section'));
    for (const conjunct of [
      'relrowsecurity',
      "has_table_privilege('authenticated','public.library_items','INSERT')",
      "has_table_privilege('authenticated','public.library_items','UPDATE')",
      "has_table_privilege('authenticated','public.library_items','TRUNCATE')",
      "has_table_privilege('authenticated','public.library_items','REFERENCES')",
      "has_table_privilege('authenticated','public.library_items','TRIGGER')",
      "has_table_privilege('anon','public.library_items','UPDATE')",
      "has_column_privilege('authenticated','public.library_items','knowledge_storage_path','UPDATE')",
      "privilege_type='INSERT'",
      "privilege_type='UPDATE'",
      'create_knowledge_pdf_area_image_post_with_library_item',
      'create_image_post_with_library_item',
      'is_knowledge_pdf_area_provenance',
      "has_function_privilege('service_role'",
      "has_function_privilege('authenticated'",
      "has_function_privilege('anon'",
      "has_function_privilege('public'",
      'prosecdef',
    ]) {
      expect(rollup, 'roll-up must assert ' + conjunct).toContain(conjunct);
    }
    // Every conjunct in the gate defends itself against NULL.
    expect((rollup.match(/COALESCE\(/g) ?? []).length).toBeGreaterThanOrEqual(20);
  });

  it('F21: the trusted RPC is service_role only and takes no path', () => {
    for (const [name, sql] of [['migration', migration], ['rollout', rollout]] as const) {
      expect(sql, name).toContain('FROM PUBLIC, anon, authenticated');
      expect(sql, name).toContain(') TO service_role;');
      expect(sql, name).not.toContain('p_storage_path');
      expect(sql, name).not.toContain('p_durable_object_path');
      // The location is derived inside the function from validated ids.
      expect(sql, name).toContain("v_storage_path := 'board-derived/'");
    }
  });

  it('F22: no second storage object, no new bucket, one new column only', () => {
    for (const [name, sql] of [['migration', migration], ['rollout', rollout]] as const) {
      expect(sql, name).not.toContain('storage.objects');
      expect(sql, name).not.toContain('createBucket');
      const added = sql.match(/ADD COLUMN IF NOT EXISTS (\w+)/g) ?? [];
      expect(added.length, name).toBeGreaterThan(0);
      expect(added.every((a) => a.endsWith('knowledge_storage_path')), name).toBe(true);
    }
  });
});

/**
 * F23-F30: the three corrections a second review demanded.
 *
 * Parser equivalence, exact policy/privilege proof, and a state machine that
 * knows every object this correction owns. These are release-critical SQL
 * properties that vitest cannot execute, so each assertion pins the specific
 * defect it prevents rather than merely spot-checking a string.
 */
describe('F23-F30: durable preview parser, policy and state-machine contract', () => {
  const migration = sourceOf('supabase/migrations/20260907120000_library_durable_image_preview.sql');
  const rollout = sourceOf('supabase/production-rollouts/20260907120000_library_durable_image.sql');
  const verifier = sourceOf('supabase/production-rollouts/20260907120000_library_durable_image_verify.sql');
  const parser = sourceOf('lib/domain/knowledge/knowledgePdfAreaImagePolicy.ts');
  const geometry = sourceOf('lib/domain/knowledge/knowledgePageRegionGeometry.ts');
  const helperOf = (sql: string) => sql.slice(
    sql.indexOf('CREATE OR REPLACE FUNCTION public.is_knowledge_pdf_area_provenance'),
    sql.indexOf('COMMENT ON FUNCTION public.is_knowledge_pdf_area_provenance'));

  it('F23: the mirror types JSON, and never validates a number as text', () => {
    const helper = helperOf(migration);
    // Number.isInteger(1.0) is true, so a digits-only regex on the serialized
    // text would strand every row whose page was stored as 1.0.
    expect(helper).not.toContain("~ '^[0-9]+$'");
    expect(helper).not.toMatch(/\^\[0-9\]\+\$/);
    // jsonb_typeof is the type authority, for every field the parser reads.
    for (const field of ["'kind'", "'knowledgeDocumentId'", "'pageNumber'", "'region'", "'x'", "'y'", "'width'", "'height'"]) {
      expect(helper, field).toContain('jsonb_typeof');
    }
    // Number.isInteger is mirrored by trunc equality, not by text shape.
    expect(helper).toContain('trunc(page_number)');
  });

  it('F24: no cast can run before the type test that guards it', () => {
    const helper = helperOf(migration);
    // Postgres does not promise AND-operands evaluate left to right, so a cast
    // guarded only by a neighbouring predicate can still raise on client JSON.
    // plpgsql statements are ordered, so each cast follows its own IF.
    expect(helper).toContain('LANGUAGE plpgsql');
    for (const cast of ["(src -> 'pageNumber')::numeric", "(reg -> 'x')::numeric"]) {
      const castAt = helper.indexOf(cast);
      expect(castAt, cast).toBeGreaterThan(-1);
      const guard = helper.lastIndexOf('RETURN false;', castAt);
      expect(guard, cast + ' must be preceded by its own guard').toBeGreaterThan(-1);
    }
    // The document id is compared as text; no uuid cast happens in the mirror.
    expect(helper).not.toContain('::uuid');
    // And anything unforeseen still cannot abort a rollout.
    expect(helper).toContain('EXCEPTION');
  });

  it('F25: epsilon and range semantics track the canonical geometry helper', () => {
    const helper = helperOf(migration);
    // The parser CLAMPS a hair-negative coordinate rather than rejecting it, so
    // `x >= 0` would be stricter than the product and would strand valid rows.
    expect(geometry).toContain('NORMALIZED_REGION_EPSILON = 1e-9');
    expect(helper).toContain('1e-9');
    expect(helper).toContain('rx < 0 AND rx > -eps');
    expect(helper).toContain('ry < 0 AND ry > -eps');
    // finalizeRegion's trim-to-remaining-page check, which a naive range test
    // omits: x = 1 with a positive width leaves no area at all.
    expect(helper).toContain('least(rw, 1 - r_left)');
    expect(helper).toContain('least(rh, 1 - r_top)');
    // The TypeScript side this mirrors is itself pinned, so the pair can't drift.
    expect(parser).toContain('normalizeStorableRegion(record.region)');
    expect(parser).toContain('Number.isInteger(pageNumber)');
  });

  it('F26: the mirror is internal machinery, not a client-callable function', () => {
    for (const [name, sql] of [['migration', migration], ['rollout', rollout]] as const) {
      expect(sql, name).toContain('REVOKE ALL ON FUNCTION public.is_knowledge_pdf_area_provenance(jsonb)\n    FROM PUBLIC, anon, authenticated;');
      expect(sql, name).toContain('GRANT EXECUTE ON FUNCTION public.is_knowledge_pdf_area_provenance(jsonb)\n    TO service_role;');
    }
    // service_role needs it because the trusted creation RPC now judges its
    // input through the same contract the repair and verifier use.
    expect(migration).toContain('IF NOT public.is_knowledge_pdf_area_provenance(p_metadata) THEN');
    expect(verifier).toContain('provenance helper is not browser-executable');
  });

  it('F27: policies are proved exactly, not by substring', () => {
    // `qual LIKE '%uid()%'` would accept `auth.uid() = user_id OR true`.
    const fingerprint = "replace(qual,' ','')='(auth.uid()=user_id)'";
    for (const [name, sql] of [['rollout', rollout], ['verifier', verifier]] as const) {
      expect(sql, name).toContain(fingerprint);
      expect(sql, name).toContain("count(*) = 4");
      // Each command pinned in its own clause, and a NULL (unrestricted)
      // USING / WITH CHECK fails the FILTER rather than passing it.
      for (const cmd of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
        expect(sql, name + ' ' + cmd).toContain("cmd='" + cmd + "'");
      }
      expect(sql, name).toContain("qual IS NULL AND replace(with_check,' ','')='(auth.uid()=user_id)'");
    }
    expect(verifier).not.toContain("qual NOT LIKE '%uid()%'");
  });

  it('F28: the release gate proves exact privilege sets, including anon DDL', () => {
    const rollup = verifier.slice(verifier.indexOf('12 AS section'));
    // Absences alone are not a contract: the sets are compared exactly.
    expect(rollup).toContain("= ARRAY['SELECT']");
    expect(rollup).toContain("= ARRAY['DELETE','SELECT']");
    // The two the previous gate checked per-section but omitted from the gate.
    expect(rollup).toContain("has_table_privilege('anon','public.library_items','REFERENCES')");
    expect(rollup).toContain("has_table_privilege('anon','public.library_items','TRIGGER')");
    // And the exact owner-policy fingerprint is part of the gate itself.
    expect(rollup).toContain("replace(qual,' ','')='(auth.uid()=user_id)'");
    expect(rollup).toContain('is_knowledge_pdf_area_provenance(jsonb)');
  });

  it('F29: the state machine knows every object this correction owns', () => {
    const preflight = rollout.slice(rollout.indexOf('DO $preflight$'), rollout.indexOf('$preflight$;'));
    // Three owned objects, not two: omitting the helper would let a half
    // applied database read as clean PRE and be mutated again.
    for (const owned of ['has_column', 'has_helper', 'has_trusted']) {
      expect(preflight, owned).toContain(owned);
    }
    expect(preflight).toContain('IF owned = 0 THEN');
    expect(preflight).toContain('IF owned <> 3 THEN');
    expect(preflight).toContain('partial state (column=%, helper=%, trusted_rpc=%)');
    // POST is more than "objects exist": grants, policies and function
    // authority must all hold, or the state is partial and a human decides.
    expect(preflight).toContain('grants_hardened');
    expect(preflight).toContain('functions_hardened');
    expect(preflight).toContain('policies_exact');
    expect(preflight).toContain('the hardened contract does not hold');
    // Not merely TRUNCATE, which is what the previous version leaned on.
    expect(preflight).toContain("has_column_privilege('authenticated', 'public.library_items', 'knowledge_storage_path', 'UPDATE')");
    // The prerequisite foundation is still required in both states.
    expect(preflight).toContain('create_image_post_with_library_item');
    // And POST never demands a live placement.
    expect(preflight).not.toContain('library_item_id = li.id');
  });

  it('F30: every aggregate and array comparison fails closed', () => {
    const preflight = rollout.slice(rollout.indexOf('DO $preflight$'), rollout.indexOf('$preflight$;'));
    // Empty grant sets aggregate to NULL; compared raw they read as "not false".
    for (const [name, sql] of [['preflight', preflight], ['verifier', verifier]] as const) {
      expect(sql, name).toContain('ARRAY[]::text[]');
      expect(sql, name).toContain('COALESCE(');
    }
    expect(preflight).toContain('COALESCE(grants_hardened, false)');
    expect(preflight).toContain('COALESCE(functions_hardened, false)');
    // The gate's own result can never be NULL.
    const rollup = verifier.slice(verifier.indexOf('12 AS section'));
    expect((rollup.match(/COALESCE\(/g) ?? []).length).toBeGreaterThanOrEqual(30);
  });
});
