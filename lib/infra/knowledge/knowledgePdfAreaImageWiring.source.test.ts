import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
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
  // IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE. The reuse path handles the SAME
  // private crop, so it is held to the same "nothing is ever published" sweep.
  'lib/domain/knowledge/knowledgePdfAreaLibraryPlacement.ts',
  'lib/server/knowledge/knowledgePdfAreaLibraryReuseRoute.ts',
  'app/api/boards/[id]/library-items/[libraryItemId]/image-placement/route.ts',
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
    expect(migration).toContain('WHEN numeric_value_out_of_range OR invalid_text_representation THEN');
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
    // Dynamic SQL passed to query_to_xml carries its own SELECT, so the
    // dollar-quoted blocks are removed before the file is split into
    // statements -- otherwise a fragment of one is mistaken for a section.
    const staticSql = verifier.replace(/\$q\$[\s\S]*?\$q\$/g, "''");
    const sections = staticSql.split('\nSELECT ').slice(1);
    expect(sections.length).toBeGreaterThanOrEqual(12);
    for (const section of sections) {
      // Dynamic SQL passed to query_to_xml contains its own SELECT, which the
      // naive split above also yields; those fragments have no `pass` column.
      if (section.indexOf(' AS pass') < 0) continue;
      const head = section.slice(0, section.indexOf(' AS pass') + ' AS pass'.length);
      expect(head.includes('COALESCE') || head.includes('true AS pass') || head.includes('false AS pass'),
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
      "WHERE grantee='anon' AND table_schema='public' AND table_name='library_items')",
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
    for (const cast of ["(src ->> 'pageNumber')::double precision", "(reg ->> 'x')::double precision"]) {
      const castAt = helper.indexOf(cast);
      expect(castAt, cast).toBeGreaterThan(-1);
      const guard = helper.lastIndexOf('RETURN false;', castAt);
      expect(guard, cast + ' must be preceded by its own guard').toBeGreaterThan(-1);
    }
    // The document id is compared as text; no uuid cast happens in the mirror.
    // Comments stripped: the helper's prose names the cast it does not do.
    expect(helper.replace(/^\s*--.*$/gm, '')).not.toContain('::uuid');
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
    expect(verifier).toContain('provenance mirror: reviewed definition, INVOKER, internal only');
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
    expect(rollup).toContain("to_regprocedure('public.is_knowledge_pdf_area_provenance(jsonb)')");
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

/**
 * F31-F36: float64 parser equivalence, policy IDENTITY, and a state machine
 * that recognises its starting point as well as its finish.
 *
 * These pin the third round of review findings. Each names the specific way a
 * database could pass the previous contract while still being wrong.
 */
describe('F31-F36: float64, policy identity and recognised-state contract', () => {
  const migration = sourceOf('supabase/migrations/20260907120000_library_durable_image_preview.sql');
  const rollout = sourceOf('supabase/production-rollouts/20260907120000_library_durable_image.sql');
  const verifier = sourceOf('supabase/production-rollouts/20260907120000_library_durable_image_verify.sql');
  const helperOf = (sql: string) => sql.slice(
    sql.indexOf('CREATE OR REPLACE FUNCTION public.is_knowledge_pdf_area_provenance'),
    sql.indexOf('COMMENT ON FUNCTION public.is_knowledge_pdf_area_provenance'));
  const preflight = rollout.slice(rollout.indexOf('DO $preflight$'), rollout.indexOf('$preflight$;'));

  it('F31: the mirror decides in float64, not arbitrary precision', () => {
    const helper = helperOf(migration);
    // JavaScript numbers are IEEE-754. `numeric` keeps 1e400 finite and
    // integral, so a numeric mirror calls Infinity valid provenance and hands a
    // durable path to a row the reader refuses.
    expect(helper).toContain('double precision');
    expect(helper).not.toMatch(/\bnumeric\b/);
    for (const decl of ['page_number double precision', 'rx double precision']) {
      expect(helper, decl).toContain(decl);
    }
    // Number.isFinite is mirrored explicitly, both directions.
    expect(helper).toContain("'Infinity'::double precision");
    expect(helper).toContain("'-Infinity'::double precision");
    // NaN via self-inequality.
    expect(helper).toContain('page_number <> page_number');
  });

  it('F32: conversions are guarded narrowly, never the whole function', () => {
    const helper = helperOf(migration);
    // Out-of-range JSON raises on cast; that is the rejection path, and it must
    // be caught around the CONVERSION only -- a function-wide WHEN OTHERS would
    // report a release defect as "not provenance".
    expect(helper).toContain('WHEN numeric_value_out_of_range OR invalid_text_representation THEN');
    expect(helper).not.toContain('WHEN others THEN');
    // Two conversion blocks: the page, and the four region scalars together.
    expect((helper.match(/EXCEPTION/g) ?? []).length).toBe(2);
    // Each conversion still follows its own jsonb_typeof test.
    for (const cast of ["(src ->> 'pageNumber')::double precision", "(reg ->> 'x')::double precision"]) {
      const at = helper.indexOf(cast);
      expect(at, cast).toBeGreaterThan(-1);
      expect(helper.lastIndexOf('jsonb_typeof', at), cast).toBeGreaterThan(-1);
    }
    // The document id is never cast at all. Comments are stripped first: the
    // helper's own prose says it performs no ::uuid cast.
    expect(helper.replace(/^\s*--.*$/gm, '')).not.toContain('::uuid');
  });

  it('F33: parity fixtures cover the float64 edges in both directions', () => {
    // The cases that separate float64 from arbitrary precision.
    for (const fixture of ['"pageNumber":1e400', '"width":1e-400', '"x":1e400', '"pageNumber":1.0']) {
      expect(verifier, fixture).toContain(fixture);
    }
    // And the epsilon clamp that separates the parser from a naive range test.
    expect(verifier).toContain('"x":-0.0000000001');
  });

  it('F34: policies are proved by IDENTITY -- name, command, role and mode', () => {
    // A renamed policy, one narrowed to a role, or a RESTRICTIVE one, all carry
    // the right predicate and the wrong authority.
    for (const [name, sql] of [['rollout', rollout], ['verifier', verifier]] as const) {
      for (const policy of [
        "policyname='Users can view their own library items'",
        "policyname='Users can insert their own library items'",
        "policyname='Users can update their own library items'",
        "policyname='Users can delete their own library items'",
      ]) {
        expect(sql, name + ' ' + policy).toContain(policy);
      }
      expect(sql, name).toContain("permissive='PERMISSIVE'");
      expect(sql, name).toContain("roles='{public}'::name[]");
    }
    // The release gate carries the identity fingerprint, not just section 7.
    const rollup = verifier.slice(verifier.indexOf('12 AS section'));
    expect(rollup).toContain("policyname='Users can view their own library items'");
    expect(rollup).toContain("permissive='PERMISSIVE'");
    expect(rollup).toContain("roles='{public}'::name[]");
  });

  it('F35: PRE is a recognised fingerprint, not merely zero owned objects', () => {
    // Normalising an unknown authority model would be this rollout inventing
    // one nobody reviewed.
    expect(preflight).toContain('legacy_grants');
    expect(preflight).toContain("ARRAY['DELETE','INSERT','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE']");
    expect(preflight).toContain('not the recognised legacy state');
    // The zero-object branch checks it BEFORE declaring PRE.
    const zeroBranch = preflight.slice(preflight.indexOf('IF owned = 0 THEN'), preflight.indexOf('IF owned <> 3 THEN'));
    expect(zeroBranch).toContain('legacy_grants');
    expect(zeroBranch).toContain('RAISE EXCEPTION');
    // The generic RPC prerequisite is fingerprinted by security mode and grants,
    // and this rollout never repairs it.
    expect(preflight).toContain('generic_ok');
    expect(preflight).toContain('prosecdef');
  });

  it('F36: POST includes function security modes, and lookups never raise', () => {
    // A DEFINER rewrite is an authority change: reported, never replaced.
    expect(preflight).toContain('functions_hardened');
    expect(preflight).toContain('NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = helper_oid)');
    expect(preflight).toContain('NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = trusted_oid)');
    // Every function is resolved by oid first, so a missing one is a decision.
    expect(preflight).toContain('to_regprocedure(helper_sig)');
    expect(preflight).toContain('to_regprocedure(trusted_sig)');
    expect(preflight).toContain('to_regprocedure(generic_sig)');
    expect(verifier).toContain(
      "to_regprocedure('public.is_knowledge_pdf_area_provenance(jsonb)')");
    expect(verifier).toContain(
      "to_regprocedure('public.create_knowledge_pdf_area_image_post_with_library_item(");
    expect(verifier).toContain(
      "to_regprocedure('public.create_image_post_with_library_item(");
    // A CASE cannot save a statement that NAMES a missing function: Postgres
    // resolves names at parse time. The checks that must CALL the mirror
    // therefore pass their query as TEXT to query_to_xml, so the name is
    // resolved at execution time and the CASE around it decides whether that
    // execution happens at all.
    expect(verifier).toContain('resolves function names at PARSE time');
    // Comments stripped: the file's own prose explains the technique by name.
    const executableSql = verifier.replace(/^\s*--.*$/gm, '');
    expect((executableSql.match(/query_to_xml\(/g) ?? []).length).toBeGreaterThanOrEqual(3);
    // Every dynamic call is preceded by its own to_regprocedure guard.
    for (const at of [...executableSql.matchAll(/query_to_xml\(/g)].map((m) => m.index ?? 0)) {
      const guard = executableSql.lastIndexOf('to_regprocedure', at);
      expect(guard, 'query_to_xml at ' + at + ' must be guarded').toBeGreaterThan(-1);
      expect(executableSql.slice(guard, at)).toContain('IS NULL THEN false');
    }
    // The verifier must run through ANY SQL executor, so nothing psql-only.
    for (const directive of ['\\gset', '\\if ', '\\else', '\\endif', '\\set ']) {
      expect(executableSql, directive).not.toContain(directive);
    }
    // Signatures are written out rather than carried in client-side variables.
    expect(verifier).not.toContain(":'helperfn'");
    expect(verifier).toContain("to_regprocedure('public.is_knowledge_pdf_area_provenance(jsonb)')");
    // The gate proves the security mode of all three functions.
    const rollup = verifier.slice(verifier.indexOf('12 AS section'));
    expect((rollup.match(/prosecdef/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

/**
 * F37-F40: the PostgreSQL 17 MAINTAIN privilege, and the identity of the
 * provenance mirror actually installed.
 *
 * Both are release-gate holes that a passing gate would not have shown:
 * information_schema cannot see MAINTAIN at all, and "a function of this name
 * exists and is INVOKER" says nothing about what its body does.
 */
describe('F37-F40: MAINTAIN privilege and installed-helper identity', () => {
  const migration = sourceOf('supabase/migrations/20260907120000_library_durable_image_preview.sql');
  const rollout = sourceOf('supabase/production-rollouts/20260907120000_library_durable_image.sql');
  const verifier = sourceOf('supabase/production-rollouts/20260907120000_library_durable_image_verify.sql');
  const preflight = rollout.slice(rollout.indexOf('DO $preflight$'), rollout.indexOf('$preflight$;'));
  const postflight = rollout.slice(rollout.indexOf('DO $postflight$'), rollout.indexOf('$postflight$;'));
  const rollup = verifier.slice(verifier.indexOf('12 AS section'));

  /** The body PostgreSQL stores as pg_proc.prosrc for the shipped helper. */
  const helperBody = (sql: string) => {
    const at = sql.indexOf('CREATE OR REPLACE FUNCTION public.is_knowledge_pdf_area_provenance');
    const open = sql.indexOf('AS $$', at) + 'AS $$'.length;
    return sql.slice(open, sql.indexOf('$$;', open)).replace(/\r\n/g, '\n');
  };

  it('F37: MAINTAIN is checked directly, never inferred from information_schema', () => {
    // PostgreSQL 17 added MAINTAIN and information_schema.table_privileges does
    // not represent it, so an exact array built from that view is blind to it
    // in both directions -- a legacy state missing it would read as recognised
    // PRE, and a hardened state retaining it would read as clean POST.
    // Spacing differs between the two files, so compare with it collapsed.
    const dense = (s: string) => s.replace(/\s+/g, '');
    for (const [name, sql] of [['rollout', rollout], ['verifier', verifier]] as const) {
      expect(sql, name).toContain("'MAINTAIN'");
      expect(dense(sql), name).toContain(dense("has_table_privilege('anon','public.library_items','MAINTAIN')"));
      expect(dense(sql), name).toContain(dense("has_table_privilege('authenticated','public.library_items','MAINTAIN')"));
    }
    // It must never be smuggled into the information_schema array instead.
    for (const arr of [
      "ARRAY['DELETE','INSERT','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE']",
      "ARRAY['SELECT']",
      "ARRAY['DELETE','SELECT']",
    ]) {
      expect(rollout + verifier, arr).not.toContain(arr.replace(']', ",'MAINTAIN']"));
    }
  });

  it('F38: PRE requires MAINTAIN present, POST requires it gone', () => {
    // PRE: the PM-confirmed production state carries it for both browser roles
    // as part of the inherited GRANT ALL.
    const zeroBranch = preflight.slice(preflight.indexOf('IF owned = 0 THEN'), preflight.indexOf('IF owned <> 3 THEN'));
    expect(zeroBranch).toContain("has_table_privilege('anon', 'public.library_items', 'MAINTAIN')");
    expect(zeroBranch).toContain("has_table_privilege('authenticated', 'public.library_items', 'MAINTAIN')");
    // POST: no browser client needs it, so it must not survive the hardening.
    const hardened = preflight.slice(preflight.indexOf('grants_hardened :='));
    expect(hardened).toContain("NOT has_table_privilege('anon', 'public.library_items', 'MAINTAIN')");
    expect(hardened).toContain("NOT has_table_privilege('authenticated', 'public.library_items', 'MAINTAIN')");
    // And the release gate carries both, not just the section output.
    expect(rollup).toContain("NOT has_table_privilege('anon','public.library_items','MAINTAIN')");
    expect(rollup).toContain("NOT has_table_privilege('authenticated','public.library_items','MAINTAIN')");
    // APPLY's own postflight must independently refuse either retained grant;
    // finding these strings in PRE/POST classification is not sufficient.
    expect(postflight).toContain("has_table_privilege('anon', 'public.library_items', 'MAINTAIN')");
    expect(postflight).toContain("has_table_privilege('authenticated', 'public.library_items', 'MAINTAIN')");
    expect(postflight).toContain('RAISE EXCEPTION');
  });

  it('F39: the installed helper is pinned by definition, not just by name', () => {
    // Existence + INVOKER would accept an arbitrary replacement parser: the
    // mirror decides what counts as provenance for creation, repair AND
    // verification, so its body is release-critical.
    for (const [name, sql] of [['preflight', preflight], ['rollup', rollup]] as const) {
      expect(sql, name + ' volatility').toContain("provolatile = 'i'");
      expect(sql, name + ' language').toContain("lanname = 'plpgsql'");
      const dense = sql.replace(/\s+/g, '');
      expect(dense, name + ' exact search_path').toContain(
        "COALESCE(p.proconfig,ARRAY[]::text[])=ARRAY['search_path=pg_catalog']::text[]",
      );
      expect(sql, name + ' extra config rejection').not.toContain('proconfig @>');
      expect(sql, name + ' body').toContain('md5(p.prosrc) =');
    }
    // The verifier checks identity both in its diagnostic section and in the
    // final gate; neither may accept an array with extra function-local GUCs.
    expect((verifier.match(/COALESCE\(p\.proconfig, ARRAY\[\]::text\[\]\)/g) ?? []).length)
      .toBeGreaterThanOrEqual(2);
    // Catalog-derived, no extension dependency, and language read through
    // pg_language rather than guessed from the source text.
    expect(preflight).toContain('JOIN pg_language l ON l.oid = p.prolang');
  });

  it('F40: the pinned digest IS the shipped helper body, in both files', () => {
    // A hand-copied digest would drift silently. This derives it from the very
    // text the CREATE FUNCTION installs, so editing the helper without
    // re-pinning fails here rather than in production.
    const fromMigration = helperBody(migration);
    const fromRollout = helperBody(rollout);
    expect(fromRollout, 'migration and rollout helper bodies must be identical')
      .toBe(fromMigration);
    const expected = createHash('md5').update(fromRollout, 'utf8').digest('hex');
    expect(expected).toMatch(/^[0-9a-f]{32}$/);
    // The same digest is pinned in the rollout's POST check and the verifier.
    expect(rollout, 'rollout must pin the shipped body digest').toContain(expected);
    expect(verifier, 'verifier must pin the shipped body digest').toContain(expected);
    // And nothing else is pinned in its place.
    const digests = new Set([...(rollout + verifier).matchAll(/\b[0-9a-f]{32}\b/g)].map((m) => m[0]));
    expect([...digests], 'exactly one body digest may appear').toEqual([expected]);
  });

  it('F40b: the helper body stays a pure parser', () => {
    const body = helperBody(migration);
    // No table reads, no writes, no dynamic SQL, no reach outside itself.
    for (const forbidden of [
      'FROM public.', 'INSERT INTO', 'UPDATE public', 'DELETE FROM',
      'EXECUTE ', 'dblink', 'COPY ', 'pg_read_file',
    ]) {
      expect(body, forbidden).not.toContain(forbidden);
    }
    // What it does contain is JSON and numeric validation only.
    expect(body).toContain('jsonb_typeof');
    expect(body).toContain('double precision');
  });
});

/**
 * IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE, group F41-F48 -- reusing a durable
 * PDF-area Library Image.
 *
 * Runtime proved the defect these pin: the Library reuse drag copied the
 * snapshot verbatim, so the new placement carried `metadata.imageUrl` for the
 * ORIGIN card. That URL dies with the origin, and the renderer reads it before
 * every row-level field, so the card painted nothing.
 *
 * The correction is a server-owned mapping plus a trusted write, NOT a renderer
 * change -- so these also pin what stayed the same.
 */
describe('F41-F48: durable Library Image reuse goes through the trusted server path', () => {
  const reuseRoute = sourceOf('lib/server/knowledge/knowledgePdfAreaLibraryReuseRoute.ts');
  const placement = sourceOf('lib/domain/knowledge/knowledgePdfAreaLibraryPlacement.ts');
  const serveRoute = sourceOf('lib/server/knowledge/knowledgePdfAreaImageServeRoute.ts');
  const libraryRoute = sourceOf('lib/server/collabboard/libraryImageServeRoute.ts');
  const reuseMigration = sourceOf(
    'supabase/migrations/20260908090000_add_knowledge_pdf_area_image_placement_mapping.sql');
  const reuseRollout = sourceOf(
    'supabase/production-rollouts/20260908090000_knowledge_pdf_area_image_placement_mapping.sql');
  const reuseVerifier = sourceOf(
    'supabase/production-rollouts/20260908090000_knowledge_pdf_area_image_placement_mapping_verify.sql');
  const reuseClient = sourceOf('lib/infra/knowledge/knowledgePdfAreaLibraryReuseClient.ts');
  const canvasData = sourceOf('components/collabboard/canvas/hooks/useCanvasData.ts');

  it('F41 (R7, R8): only a durable PDF-area IMAGE takes the trusted path', () => {
    // ONE decision helper on this screen, and every Library boundary calls it.
    const helper = after(canvasClient, 'const placeDurablePdfAreaLibraryImage = useCallback(', 1200);
    expect(helper).toContain('readKnowledgePdfAreaLibraryPlacement(draft, canvasId)');
    expect(helper).toContain("if (intent === null) return 'not-applicable';");
    expect(helper).toContain('requestKnowledgePdfAreaLibraryPlacement(intent)');
    // Both drop boundaries consult it, and the ordinary path is still reached
    // by everything it declines.
    expect((canvasClient.match(/await placeDurablePdfAreaLibraryImage\(/g) ?? []).length)
      .toBeGreaterThanOrEqual(2);
    const gate = canvasClient.indexOf('await placeDurablePdfAreaLibraryImage({');
    const ordinary = canvasClient.indexOf('await addPadletFromLibraryItem({', gate);
    expect(ordinary).toBeGreaterThan(gate);
  });

  it('F42: the browser sends a POSITION to the board-scoped reuse route, nothing more', () => {
    // The request is built once, in the shared client, from an intent the
    // classifier produced -- never spread from the drag payload.
    expect(reuseClient).toContain('/library-items/');
    expect(reuseClient).toContain('/image-placement');
    expect(reuseClient).toContain("method: 'POST'");
    expect(reuseClient).toContain(
      'JSON.stringify({ positionX: intent.positionX, positionY: intent.positionY })');
    for (const forbidden of ['knowledge_storage_path', 'storagePath', 'originBoardId',
      'originPadletId', 'board-derived/']) {
      expect(reuseClient, forbidden).not.toContain(forbidden);
    }
    // And the intent itself carries only board, library id and a position.
    expect(reuseClient).toContain('readonly boardId: string;');
    expect(reuseClient).toContain('readonly libraryItemId: string;');
    expect(reuseClient).toContain('readonly positionX: number;');
  });

  it('F43: a refused reuse never falls back to the browser INSERT', () => {
    const helper = after(canvasClient, 'const placeDurablePdfAreaLibraryImage = useCallback(', 1600);
    expect(helper).toContain('toast.error');
    expect(helper).toContain("return 'refused';");
    // Both boundaries treat anything other than 'not-applicable' as final.
    expect((canvasClient.match(/if \(durable !== 'not-applicable'\) return;/g) ?? []).length)
      .toBeGreaterThanOrEqual(2);
    // And the hook re-raises rather than inserting.
    expect(canvasData).toContain('if (!durable.ok) throw durablePlacementError(durable.status);');
  });

  it('F44: the placement metadata is rebound by ONE canonical helper', () => {
    expect(reuseRoute).toContain('buildKnowledgePdfAreaPlacementMetadata(item.metadata, { boardId, padletId })');
    // The helper rebinds the base-image aliases and nothing else. Its
    // sanitation list is domain-local (lib/domain must stay pure) and is pinned
    // against the canvas engine's own list by its unit tests.
    expect(placement).toContain('KNOWLEDGE_PDF_AREA_PLACEMENT_ONLY_METADATA_KEYS');
    expect(placement).not.toContain('@/components');
    expect(placement).toContain('metadata.imageUrl = imageUrl');
    expect(placement).toContain("KNOWLEDGE_PDF_AREA_PLACEMENT_URL_ALIASES = ['imageUrl', 'fileUrl', 'file_url']");
    // The composite and the provenance are never rewritten.
    expect(placement).not.toContain('metadata.drawing =');
    expect(placement).not.toContain('metadata.previewUrl =');
    expect(placement).not.toContain('metadata.source =');
  });

  it('F45 (R23, R24): neither the owner Library route nor the renderer changed', () => {
    // The owner-scoped route still proves authority through the CALLER's own
    // client and knows nothing about the mapping.
    expect(libraryRoute).toContain('sessionClient');
    expect(libraryRoute).toContain("from('library_items')");
    expect(libraryRoute).not.toContain('knowledge_pdf_area_image_placements');
    // The display resolver is untouched: metadata still outranks the row.
    const resolver = sourceOf('lib/domain/canvas/imagePostDisplaySource.ts');
    const order = ['metadata?.drawing', 'metadata?.imageUrl', 'metadata?.fileUrl',
      'metadata?.file_url', 'padlet.image_url', 'padlet.file_url'];
    let cursor = -1;
    for (const field of order) {
      const at = resolver.indexOf(field, cursor + 1);
      expect(at, field).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  it('F46 (R16-R21): the serve route keeps the direct branch first and gates the fallback', () => {
    const direct = serveRoute.indexOf('knowledgePdfAreaImagePath(boardId, padletId)');
    const fallback = serveRoute.indexOf('await resolveDurableReuseBytes(');
    expect(direct).toBeGreaterThan(-1);
    expect(fallback).toBeGreaterThan(direct);
    // The request's own board is passed in, because the fallback has to compare
    // it with the board the entitlement was granted on.
    expect(serveRoute).toContain('session, boardId, padletId, padlet, placementProvenance,');
    // Every gate, in the order that makes the mapping -- not the browser
    // writable column -- the thing that authorises the read.
    const resolver = after(serveRoute, 'async function resolveDurableReuseBytes', 2600);
    expect(resolver).toContain('session.findPlacementMapping(padletId)');
    expect(resolver).toContain('mapping.padletId !== padletId');
    expect(resolver).toContain('padlet.libraryItemId !== mapping.libraryItemId');
    expect(resolver).toContain('session.findMappedLibraryItem(mapping.libraryItemId)');
    expect(resolver).toContain("item.type !== 'image'");
    expect(resolver).toContain('knowledgePdfAreaProvenanceMatches(placementProvenance, libraryProvenance)');
    expect(resolver).toContain('item.knowledgeStoragePath');
    // THE BOARD BINDING: request board, padlet board and mapping board must all
    // agree, so a padlet moved by a browser carries no entitlement with it.
    expect(resolver).toContain('mapping.boardId !== boardId');
    expect(resolver).toContain('padlet.boardId !== boardId');
    // The path is never derived from, or read out of, the placement's metadata.
    expect(resolver).not.toContain('board-derived/');
  });

  it('F47: the mapping is server-owned, board-bound, and nothing is backfilled', () => {
    for (const sql of [reuseMigration, reuseRollout]) {
      expect(sql).toContain('public.knowledge_pdf_area_image_placements');
      expect(sql).toContain('padlet_id uuid PRIMARY KEY');
      expect(sql).toContain('REFERENCES public.padlets(id) ON DELETE CASCADE');
      expect(sql).toContain('REFERENCES public.library_items(id) ON DELETE CASCADE');
      // The board the entitlement was granted on: NOT NULL, and a real column
      // rather than something inferred from the padlet at read time.
      expect(sql).toContain('board_id uuid NOT NULL');
      expect(sql).toContain('REFERENCES public.boards(id) ON DELETE CASCADE');
      expect(sql).toContain('created_at timestamptz NOT NULL DEFAULT now()');
      expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
      expect(sql).toContain('REVOKE ALL ON TABLE public.knowledge_pdf_area_image_placements FROM anon');
      expect(sql).toContain('REVOKE ALL ON TABLE public.knowledge_pdf_area_image_placements FROM authenticated');
      expect(sql).toContain('GRANT ALL ON TABLE public.knowledge_pdf_area_image_placements TO service_role');
      // Zero policies: none is created anywhere in either file.
      expect(sql).not.toContain('CREATE POLICY');

      // The trusted function: service_role only, no authority of its own, and
      // the mapping it writes records the board it just re-proved.
      const definition = sql.slice(
        sql.indexOf('CREATE OR REPLACE FUNCTION public.create_knowledge_pdf_area_image_reuse_placement') >= 0
          ? sql.indexOf('CREATE OR REPLACE FUNCTION public.create_knowledge_pdf_area_image_reuse_placement')
          : sql.indexOf('CREATE FUNCTION public.create_knowledge_pdf_area_image_reuse_placement'));
      expect(definition).toContain('SECURITY INVOKER');
      expect(definition.slice(0, definition.indexOf('END;'))).not.toContain('SECURITY DEFINER');
      expect(definition).toContain('RETURNS TABLE (padlet_id uuid, library_item_id uuid, board_id uuid)');
      expect(definition).toContain('SET search_path = public');
      expect(definition).toContain('board_collaborators');
      expect(definition).toContain('is_knowledge_pdf_area_provenance');
      expect(definition).toContain(
        'INSERT INTO public.knowledge_pdf_area_image_placements (padlet_id, library_item_id, board_id)');
      expect(definition).toContain('VALUES (p_padlet_id, p_library_item_id, p_board_id)');
      expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.create_knowledge_pdf_area_image_reuse_placement');

      // It copies nothing: no storage, no second library row, no path input.
      // Judged on the DEFINITION -- the rollout's fingerprint legitimately
      // NAMES these strings in the NOT LIKE guards that prove their absence.
      expect(definition).not.toContain('INSERT INTO public.library_items');
      expect(definition).not.toContain('p_storage_path');
      expect(definition).not.toContain('storage.objects');
      // And no backfill of the new mapping from existing rows.
      expect(sql).not.toMatch(/INSERT INTO public\.knowledge_pdf_area_image_placements[^;]*SELECT[^;]*FROM public\.padlets/);
    }
    // The closed durable-preview objects are not touched here.
    expect(reuseRollout).not.toContain('ALTER TABLE public.library_items');
    expect(reuseRollout).not.toContain('CREATE OR REPLACE FUNCTION public.is_knowledge_pdf_area_provenance');
  });

  it('F48: the rollout is an EXACT state machine that cannot silently repair', () => {
    // Exactly two recognised states, and every mutation lives behind the PRE
    // branch: the DDL is inside EXECUTE strings reached only after the POST
    // test returned false and the PRE test passed.
    expect(reuseRollout).toContain('EXACT POST already released -- no mutation performed');
    expect(reuseRollout).toContain('EXACT PRE -- applying');
    expect(reuseRollout).toContain('refusing to mutate');
    expect(reuseRollout).toContain('BEGIN;');
    expect(reuseRollout).toContain('COMMIT;');

    // No mutating statement may sit at the top level of the batch, where it
    // would run whatever the state turned out to be.
    const topLevel = reuseRollout
      .split('\n')
      .filter((line) => /^(CREATE|ALTER|GRANT|REVOKE|DROP|COMMENT|INSERT|UPDATE|DELETE)\b/.test(line));
    expect(topLevel, 'every mutation must be gated inside the state machine').toEqual([]);

    // The POST test and the postflight are the SAME query, evaluated twice --
    // they cannot disagree about what "released" means.
    const fingerprint = reuseRollout.slice(
      reuseRollout.indexOf('$fp$') + '$fp$'.length,
      reuseRollout.lastIndexOf('$fp$'),
    ).trim();
    expect(fingerprint.length).toBeGreaterThan(500);
    expect((reuseRollout.match(/EXECUTE fingerprint INTO is_post;/g) ?? []).length).toBe(2);

    // And the verifier's release gate is that same text, verbatim.
    expect(reuseVerifier).toContain(fingerprint);

    // The gate covers the whole contract, not just existence.
    for (const condition of [
      "count(*) = 4 FROM information_schema.columns",
      "'board_id:uuid:NO','created_at:timestamp with time zone:NO'",
      "column_default = 'now()'",
      "contype = 'p'",
      "c.confrelid = to_regclass('public.padlets')",
      "c.confrelid = to_regclass('public.library_items')",
      "c.confrelid = to_regclass('public.boards')",
      'relrowsecurity',
      'pg_policy',
      "'MAINTAIN'",
      "lanname = 'plpgsql'",
      "ARRAY['search_path=public']::text[]",
      'pg_get_function_identity_arguments',
      'pg_get_function_result',
      'md5(p.prosrc)',
      'library_item_id, board_id)',
    ]) {
      expect(fingerprint, condition).toContain(condition);
    }

    // Generic SQL only, in the verifier: comments stripped first, because the
    // file's own header NAMES the metacommands it refuses to use.
    const verifierSql = reuseVerifier.replace(/^\s*--.*$/gm, '');
    for (const meta of ['\\gset', '\\if', '\\else', '\\endif', '\\set', '\\echo']) {
      expect(verifierSql, meta).not.toContain(meta);
    }
    // A missing object must read as false, never abort the report.
    expect(reuseVerifier).toContain("has_table_privilege('anon', t.oid,");
    expect(reuseVerifier).toContain('to_regclass(');
    expect(reuseVerifier).toContain('to_regprocedure(');
    expect(reuseVerifier).toContain(', false) AS pass');
  });

  it('F49: the pinned digest IS the shipped function body, in both SQL files', () => {
    // Derived from the very text that installs the function, so editing the
    // body without re-pinning fails here rather than in production.
    const bodyOf = (sql: string, open: string) => {
      // The definition, not the REVOKE/GRANT/COMMENT that repeat its name.
      const at = sql.search(/FUNCTION public\.create_knowledge_pdf_area_image_reuse_placement\(\s*\n\s*p_padlet_id uuid/);
      expect(at, 'function definition not found').toBeGreaterThan(-1);
      const from = sql.indexOf(open, at) + open.length;
      return sql.slice(from, sql.indexOf(open.replace('AS ', ''), from)).replace(/\r\n/g, '\n');
    };
    const fromMigration = bodyOf(reuseMigration, 'AS $$');
    const fromRollout = bodyOf(reuseRollout, 'AS $fn$');
    expect(fromRollout, 'migration and rollout bodies must be identical').toBe(fromMigration);

    const expected = createHash('md5').update(fromMigration, 'utf8').digest('hex');
    expect(expected).toMatch(/^[0-9a-f]{32}$/);
    expect(reuseRollout, 'rollout must pin the shipped body digest').toContain(expected);
    expect(reuseVerifier, 'verifier must pin the shipped body digest').toContain(expected);
    // And nothing else is pinned in its place.
    const digests = new Set(
      [...(reuseRollout + reuseVerifier).matchAll(/\b[0-9a-f]{32}\b/g)].map((m) => m[0]),
    );
    expect([...digests], 'exactly one body digest may appear').toEqual([expected]);
  });
});
