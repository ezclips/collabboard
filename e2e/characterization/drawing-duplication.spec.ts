import { test, expect, type Page } from '@playwright/test';
import { hasE2ECredentials } from '../helpers/env';
import {
  assertDrawingFixtureCleanup,
  cleanupDrawingFixture,
  createDisposableDrawingBoard,
  openDrawingBoard,
  registerDrawingCleanup,
  seedDrawingContainers,
  seedLineScene,
} from './drawingBridgeHarness';

type MetadataSnapshot = Record<string, unknown>;
type PadletRow = {
  id: string;
  title: string;
  content: string | null;
  type: string;
  position_x: number | null;
  position_y: number | null;
  width: number | null;
  height: number | null;
  metadata: MetadataSnapshot | null;
};

const DUPLICATE_LABEL = 'Duplicate';
const COPY_LABEL = 'Copy';
const PASTE_LABEL = 'Paste';
const COMMAND_ACCESSIBLE_NAMES = {
  [DUPLICATE_LABEL]: /^Duplicate\s+Ctrl\+D$/,
  [COPY_LABEL]: /^Copy\s+Ctrl\+C$/,
  [PASTE_LABEL]: /^Paste\s+Ctrl\+V$/,
} as const;
const MEMBERSHIP_KEYS = [
  'parentId',
  'childPadletIds',
  'sectionId',
  'sectionPosition',
  'position_in_timeline',
  'wallPosition',
] as const;

registerDrawingCleanup(test);

function metadataFor(containerId: string, childId: string, label: 'A' | 'B'): MetadataSnapshot {
  return {
    patch064Harness: true,
    patch071OrdinaryMetadata: `ordinary-${label}`,
    topStrip: label === 'A' ? '#f97316' : '#0ea5e9',
    // A truthy parentId makes Drawing treat the row as a child and removes the root card trigger.
    parentId: '',
    childPadletIds: [childId],
    sectionId: `patch-071-section-${label}`,
    sectionPosition: label === 'A' ? 17 : 29,
    position_in_timeline: label === 'A' ? 101 : 202,
    wallPosition: {
      lane: `patch-071-wall-${label}`,
      x: label === 'A' ? 31 : 47,
      y: label === 'A' ? 53 : 79,
    },
  };
}

function cloneMetadata(metadata: unknown): MetadataSnapshot {
  expect(metadata).toBeTruthy();
  expect(typeof metadata).toBe('object');
  expect(Array.isArray(metadata)).toBe(false);
  return JSON.parse(JSON.stringify(metadata)) as MetadataSnapshot;
}

function expectMembershipKeysRemoved(clone: MetadataSnapshot) {
  const removed: string[] = [];
  for (const key of MEMBERSHIP_KEYS) {
    expect(Object.prototype.hasOwnProperty.call(clone, key)).toBe(false);
    removed.push(key);
  }
  return removed;
}

async function fetchPadletRows(supabase: any, boardId: string): Promise<PadletRow[]> {
  const { data, error } = await supabase
    .from('padlets')
    .select('id,title,content,type,position_x,position_y,width,height,metadata')
    .eq('board_id', boardId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function fetchPadletRow(supabase: any, id: string): Promise<PadletRow> {
  const { data, error } = await supabase
    .from('padlets')
    .select('id,title,content,type,position_x,position_y,width,height,metadata')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

async function waitForCloneByTitle(
  supabase: any,
  boardId: string,
  source: PadletRow,
  knownIds: Set<string>,
): Promise<PadletRow> {
  return expect.poll(async () => {
    const rows = await fetchPadletRows(supabase, boardId);
    const clone = rows.find((row) => row.title === source.title && !knownIds.has(row.id));
    return clone ?? null;
  }, { timeout: 30_000 }).not.toBeNull().then(async () => {
    const rows = await fetchPadletRows(supabase, boardId);
    const clone = rows.find((row) => row.title === source.title && !knownIds.has(row.id));
    expect(clone).toBeTruthy();
    return clone!;
  });
}

async function openPostMenu(page: Page, padletId: string, expectedLabel: string) {
  const card = page.locator(`[data-padlet-id="${padletId}"]`).first();
  await expect(card).toHaveCount(1);
  await card.hover();
  const trigger = card.locator('[data-post-menu-trigger="true"]').first();
  await expect(trigger).toHaveCount(1);
  const box = await trigger.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(Math.round(box!.x + box!.width / 2), Math.round(box!.y + box!.height / 2));
  await page.mouse.click(Math.round(box!.x + box!.width / 2), Math.round(box!.y + box!.height / 2), { button: 'right' });
  await expect(page.getByRole('button', { name: COMMAND_ACCESSIBLE_NAMES[expectedLabel as keyof typeof COMMAND_ACCESSIBLE_NAMES] })).toBeVisible();
  const browserContextMenuProbe = await page.evaluate(() => {
    const selection = window.getSelection();
    return {
      appMenuOpen: Array.from(document.querySelectorAll('button')).some((button) => button.textContent?.includes('Duplicate')),
      selectedText: selection?.toString() ?? '',
    };
  });
  expect(browserContextMenuProbe.appMenuOpen).toBe(true);
  return {
    triggerBox: {
      x: Math.round(box!.x),
      y: Math.round(box!.y),
      width: Math.round(box!.width),
      height: Math.round(box!.height),
    },
  };
}

test.describe('drawing clone membership metadata characterization (PATCH-071 Stage 1)', () => {
  test.skip(!hasE2ECredentials, 'E2E_EMAIL / E2E_PASSWORD not set (see .env.e2e.example)');

  test('proves clone membership metadata is sanitized through Duplicate and Copy/Paste', async ({ page }) => {
    test.setTimeout(180_000);
    const { supabase, fixture } = await createDisposableDrawingBoard('duplication');

    try {
      const seeded = await seedDrawingContainers(supabase, fixture);
      const containerA = seeded.containers[0];
      const containerB = seeded.containers[1];
      const childA = seeded.children[0];
      const childB = seeded.children[1];
      const metadataA = metadataFor(containerA.id, childA.id, 'A');
      const metadataB = metadataFor(containerB.id, childB.id, 'B');
      const { error: updateError } = await supabase
        .from('padlets')
        .upsert([
          {
            id: containerA.id,
            board_id: fixture.boardId,
            title: containerA.title,
            metadata: metadataA,
          },
          {
            id: containerB.id,
            board_id: fixture.boardId,
            title: containerB.title,
            metadata: metadataB,
          },
        ]);
      if (updateError) throw updateError;
      await seedLineScene(supabase, fixture);

      await openDrawingBoard(page, fixture.boardId);

      const originalA = await fetchPadletRow(supabase, containerA.id);
      const originalB = await fetchPadletRow(supabase, containerB.id);
      const originalAMetadata = cloneMetadata(originalA.metadata);
      const originalBMetadata = cloneMetadata(originalB.metadata);
      const knownIdsBeforeDuplicate = new Set((await fetchPadletRows(supabase, fixture.boardId)).map((row) => row.id));

      const duplicateTrigger = await openPostMenu(page, containerA.id, DUPLICATE_LABEL);
      const duplicateButton = page.getByRole('button', { name: COMMAND_ACCESSIBLE_NAMES[DUPLICATE_LABEL] });
      await expect(duplicateButton).toBeVisible();
      await duplicateButton.click();
      const duplicateRow = await waitForCloneByTitle(supabase, fixture.boardId, originalA, knownIdsBeforeDuplicate);
      expect(duplicateRow.id).not.toBe(originalA.id);
      expect(duplicateRow.content).toBe(originalA.content);
      const duplicateMetadata = cloneMetadata(duplicateRow.metadata);
      const duplicateRemovedKeys = expectMembershipKeysRemoved(duplicateMetadata);
      expect(duplicateMetadata.patch071OrdinaryMetadata).toBe(originalAMetadata.patch071OrdinaryMetadata);
      expect(duplicateMetadata.topStrip).toBe(originalAMetadata.topStrip);

      const knownIdsBeforePaste = new Set((await fetchPadletRows(supabase, fixture.boardId)).map((row) => row.id));
      const copyTrigger = await openPostMenu(page, containerB.id, COPY_LABEL);
      const copyButton = page.getByRole('button', { name: COMMAND_ACCESSIBLE_NAMES[COPY_LABEL] });
      await expect(copyButton).toBeVisible();
      await copyButton.click();
      const rowsAfterCopy = await fetchPadletRows(supabase, fixture.boardId);
      expect(rowsAfterCopy.find((row) => row.title === originalB.title && !knownIdsBeforePaste.has(row.id)) ?? null).toBeNull();
      const pasteTrigger = await openPostMenu(page, containerB.id, PASTE_LABEL);
      const pasteButton = page.getByRole('button', { name: COMMAND_ACCESSIBLE_NAMES[PASTE_LABEL] });
      await expect(pasteButton).toBeEnabled();
      await pasteButton.click();
      const pastedRow = await waitForCloneByTitle(supabase, fixture.boardId, originalB, knownIdsBeforePaste);
      expect(pastedRow.id).not.toBe(originalB.id);
      expect(pastedRow.content).toBe(originalB.content);
      const pastedMetadata = cloneMetadata(pastedRow.metadata);
      const pastedRemovedKeys = expectMembershipKeysRemoved(pastedMetadata);
      expect(pastedMetadata.patch071OrdinaryMetadata).toBe(originalBMetadata.patch071OrdinaryMetadata);
      expect(pastedMetadata.topStrip).toBe(originalBMetadata.topStrip);

      const childAAfter = await fetchPadletRow(supabase, childA.id);
      const childBAfter = await fetchPadletRow(supabase, childB.id);
      expect((childAAfter.metadata as MetadataSnapshot).parentId).toBe(containerA.id);
      expect((childBAfter.metadata as MetadataSnapshot).parentId).toBe(containerB.id);

      const originalAAfter = await fetchPadletRow(supabase, containerA.id);
      const originalBAfter = await fetchPadletRow(supabase, containerB.id);
      expect(cloneMetadata(originalAAfter.metadata)).toEqual(originalAMetadata);
      expect(cloneMetadata(originalBAfter.metadata)).toEqual(originalBMetadata);

      const duplicateChildVisible = await page.locator(`[data-padlet-id="${duplicateRow.id}"]`).getByText(childA.title).count();
      const pastedChildVisible = await page.locator(`[data-padlet-id="${pastedRow.id}"]`).getByText(childB.title).count();
      expect(duplicateChildVisible).toBe(0);
      expect(pastedChildVisible).toBe(0);
      const classification = {
        duplicateTriggerReachable: true,
        copyTriggerReachable: true,
        pasteTriggerReachable: true,
        duplicateCommandLabel: DUPLICATE_LABEL,
        copyCommandLabel: COPY_LABEL,
        pasteCommandLabel: PASTE_LABEL,
        originalPostId: originalA.id,
        copySourcePostId: originalB.id,
        duplicatePostId: duplicateRow.id,
        pastedPostId: pastedRow.id,
        ordinaryMetadataPreserved: true,
        removedMembershipKeys: Array.from(new Set([...duplicateRemovedKeys, ...pastedRemovedKeys])),
        duplicateSanitizedMetadataSnapshot: duplicateMetadata,
        pastedSanitizedMetadataSnapshot: pastedMetadata,
        originalMetadataSnapshot: {
          duplicateSource: originalAMetadata,
          pasteSource: originalBMetadata,
        },
        originalsStable: true,
        cloneRowsHaveNewIds: duplicateRow.id !== originalA.id && pastedRow.id !== originalB.id,
        sanitizedKeyAbsence: {
          duplicateParentIdRemoved: !Object.prototype.hasOwnProperty.call(duplicateMetadata, 'parentId'),
          duplicateChildPadletIdsRemoved: !Object.prototype.hasOwnProperty.call(duplicateMetadata, 'childPadletIds'),
          duplicateSectionIdRemoved: !Object.prototype.hasOwnProperty.call(duplicateMetadata, 'sectionId'),
          duplicateSectionPositionRemoved: !Object.prototype.hasOwnProperty.call(duplicateMetadata, 'sectionPosition'),
          duplicateTimelinePositionRemoved: !Object.prototype.hasOwnProperty.call(duplicateMetadata, 'position_in_timeline'),
          duplicateWallPositionRemoved: !Object.prototype.hasOwnProperty.call(duplicateMetadata, 'wallPosition'),
          pastedParentIdRemoved: !Object.prototype.hasOwnProperty.call(pastedMetadata, 'parentId'),
          pastedChildPadletIdsRemoved: !Object.prototype.hasOwnProperty.call(pastedMetadata, 'childPadletIds'),
          pastedSectionIdRemoved: !Object.prototype.hasOwnProperty.call(pastedMetadata, 'sectionId'),
          pastedSectionPositionRemoved: !Object.prototype.hasOwnProperty.call(pastedMetadata, 'sectionPosition'),
          pastedTimelinePositionRemoved: !Object.prototype.hasOwnProperty.call(pastedMetadata, 'position_in_timeline'),
          pastedWallPositionRemoved: !Object.prototype.hasOwnProperty.call(pastedMetadata, 'wallPosition'),
        },
        childPointersStillOriginal: {
          childAParentId: (childAAfter.metadata as MetadataSnapshot).parentId,
          childBParentId: (childBAfter.metadata as MetadataSnapshot).parentId,
        },
        visibleSanitizedContainerProbe: {
          duplicateCardShowsOriginalChildCount: duplicateChildVisible,
          pastedCardShowsOriginalChildCount: pastedChildVisible,
        },
        triggerPath: {
          duplicate: ['hover Container A card', 'right-click Edit pencil', `click ${DUPLICATE_LABEL}`],
          copyPaste: ['hover Container B card', 'right-click Edit pencil', `click ${COPY_LABEL}`, 'right-click Edit pencil again', `click ${PASTE_LABEL}`],
          duplicateTrigger,
          copyTrigger,
          pasteTrigger,
        },
        copyAloneCreatesNoClone: true,
        exactCorruptionFamily: 'clone-membership-metadata-sanitized',
        sanitizerOwner: 'command-layer metadata sanitation',
        stage1Status: 'fixed',
        exactlySixKeysRemoved: true,
        noGraphRepairAttempted: true,
        parentIdCaveat: 'seeded falsy parentId is removed unconditionally; this spec does not claim truthy-parentId UI reachability',
        nonImplicatedAreas: ['DrawingLayout', 'CanvasContextMenu', 'resolver', 'persistence schema'],
        commentStoreKeysInvolved: false,
      };
      test.info().annotations.push(
        { type: 'patch-071-stage0-trigger-path', description: JSON.stringify(classification.triggerPath) },
        { type: 'patch-071-stage0-duplicate-metadata', description: JSON.stringify({ original: originalAMetadata, clone: duplicateMetadata, removedMembershipKeys: duplicateRemovedKeys }) },
        { type: 'patch-071-stage0-copy-paste-metadata', description: JSON.stringify({ original: originalBMetadata, clone: pastedMetadata, removedMembershipKeys: pastedRemovedKeys }) },
        { type: 'patch-071-stage0-classification', description: JSON.stringify(classification) },
        { type: 'patch-071-clone-membership-fix', description: JSON.stringify(classification) },
      );
    } finally {
      await cleanupDrawingFixture(supabase, fixture);
      await expect(assertDrawingFixtureCleanup(supabase, fixture)).resolves.toEqual({
        boards: 0,
        padlets: 0,
        canvasLines: 0,
      });
    }
  });
});
