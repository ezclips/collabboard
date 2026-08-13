import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

function extractFunctionBody(src: string, startMarker: string, endMarker: string): string {
  const start = src.indexOf(startMarker);
  expect(start, `could not find "${startMarker}"`).toBeGreaterThan(-1);
  const end = src.indexOf(endMarker, start + startMarker.length);
  expect(end, `could not find "${endMarker}" after "${startMarker}"`).toBeGreaterThan(-1);
  return src.slice(start, end);
}

describe('PATCH 9B: Replace Image reuses the real Supabase Storage upload path (not base64)', () => {
  const src = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
  const replaceImageBody = extractFunctionBody(src, 'const replaceImage = (id: string) => {', 'const imageExtensionFromMimeType');

  it('uses createStorageGateway + the padlet-files bucket, mirroring addImageToLink -- not openImagePostEditor/base64', () => {
    expect(replaceImageBody).toContain("createStorageGateway()");
    expect(replaceImageBody).toContain("storageGateway.upload('padlet-files'");
    expect(replaceImageBody).not.toContain('openImagePostEditor');
    expect(replaceImageBody).not.toContain('readAsDataURL');
    expect(replaceImageBody).not.toContain('FileReader');
  });

  it('uses a real <input type=file accept=image/*> file picker', () => {
    expect(replaceImageBody).toContain("input.type = 'file'");
    expect(replaceImageBody).toContain("input.accept = 'image/*'");
    expect(replaceImageBody).toContain('input.click()');
  });

  it('rejects a non-image file before uploading', () => {
    expect(replaceImageBody).toContain("file.type.startsWith('image/')");
  });

  it('cancel is safe: returns immediately when no file was chosen, before any upload/persistence call', () => {
    const guardIndex = replaceImageBody.indexOf('if (!file) return;');
    const uploadIndex = replaceImageBody.indexOf('storageGateway.upload');
    expect(guardIndex).toBeGreaterThan(-1);
    expect(uploadIndex).toBeGreaterThan(guardIndex);
  });

  it('only updates metadata.imageUrl, never the file_url column -- matching PostCardContent.tsx\'s documented precedence contract', () => {
    expect(replaceImageBody).toContain('imageUrl };');
    expect(replaceImageBody).not.toMatch(/file_url\s*:/);
  });

  it('preserves the rest of the post\'s metadata via a spread (comments, container membership, caption, etc.)', () => {
    expect(replaceImageBody).toContain('{ ...padlet.metadata, imageUrl }');
  });

  it('local state only updates after a successful persisted write (no false-optimistic replacement)', () => {
    const updateCallIndex = replaceImageBody.indexOf('updatePostMetadata(');
    const okCheckIndex = replaceImageBody.indexOf('if (!updateResult.ok)');
    const setPadletsIndex = replaceImageBody.indexOf('setPadlets(prev =>');
    expect(updateCallIndex).toBeGreaterThan(-1);
    expect(okCheckIndex).toBeGreaterThan(updateCallIndex);
    expect(setPadletsIndex).toBeGreaterThan(okCheckIndex);
  });
});

describe('PATCH 9B: Download Original Image performs zero post mutations', () => {
  const src = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
  const downloadImageBody = extractFunctionBody(src, 'const downloadImage = async (id: string) => {', '\n  const toggleCropToGrid');

  it('uses the canonical fetch -> Blob -> object URL -> <a download> -> revoke mechanism', () => {
    expect(downloadImageBody).toContain('await fetch(padlet.metadata.imageUrl)');
    expect(downloadImageBody).toContain('await response.blob()');
    expect(downloadImageBody).toContain('window.URL.createObjectURL(blob)');
    expect(downloadImageBody).toContain('window.URL.revokeObjectURL(url)');
  });

  it('reads the original asset URL (metadata.imageUrl), not a cropped/display-only field', () => {
    expect(downloadImageBody).toContain('padlet.metadata.imageUrl');
    expect(downloadImageBody).not.toContain('cropToGrid');
  });

  it('performs zero board mutations: no metadata update command, no fetchData refresh call, no setPadlets', () => {
    expect(downloadImageBody).not.toContain('updatePostMetadata');
    expect(downloadImageBody).not.toContain('updatePostPosition');
    expect(downloadImageBody).not.toContain('setPadlets');
    expect(downloadImageBody).not.toContain('fetchData(');
    expect(downloadImageBody).not.toContain('markPadletLocallyModified');
  });

  it('derives a real filename with an extension (not the bare, extensionless title fallback)', () => {
    expect(downloadImageBody).toContain('imageExtensionFromMimeType(blob.type)');
    expect(downloadImageBody).not.toContain("padlet.title || 'downloaded-image'");
  });

  it('prefers a stored original filename (import flows) when present', () => {
    expect(downloadImageBody).toContain('importFileName');
  });
});

describe('PATCH 9B: Crop Image to Fit Dot Grid has a real rendering consumer using the shared grid constant', () => {
  it('FreeformPadletCards.tsx reads cropToGrid and applies IMAGE_CROP_TO_GRID_HEIGHT_PX (root-level card)', () => {
    const src = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
    expect(src).toContain("import { isStripVisible, htmlToText, getEligibleContainerDestinations, IMAGE_CROP_TO_GRID_HEIGHT_PX } from '@/components/collabboard/canvas/engine/utils';");
    expect(src).toContain("(padlet.metadata as any)?.cropToGrid === true");
    expect(src).toContain('${IMAGE_CROP_TO_GRID_HEIGHT_PX}px');
    expect(src).toContain('w-full object-cover pointer-events-none select-none');
  });

  it('PostCardContent.tsx reads cropToGrid and applies the SAME shared constant (Container/Map/Drawing nesting)', () => {
    const src = read('components/collabboard/PostCardContent.tsx');
    expect(src).toContain('import { IMAGE_CROP_TO_GRID_HEIGHT_PX } from "@/components/collabboard/canvas/engine/utils";');
    expect(src).toContain('const isCropToGrid = (padlet.metadata as any)?.cropToGrid === true;');
    expect(src).toContain('${IMAGE_CROP_TO_GRID_HEIGHT_PX}px');
  });

  it('the crop is non-destructive: neither renderer ever writes imageUrl based on cropToGrid', () => {
    const freeform = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
    const postCard = read('components/collabboard/PostCardContent.tsx');
    // Only ONE cropToGrid-adjacent imageUrl write exists repo-wide: the
    // pre-existing, separate destructive ImageCropLayer feature in
    // CanvasClient.tsx, which this patch does not touch.
    expect(freeform.match(/cropToGrid[\s\S]{0,220}imageUrl\s*[:=]/)).toBeNull();
    expect(postCard.match(/cropToGrid[\s\S]{0,220}imageUrl\s*[:=]/)).toBeNull();
  });
});

describe('PATCH 9B: Group into Column remains untouched', () => {
  it('groupIntoColumn still delegates to attachPostToContainer for an existing target (PATCH 9A regression)', () => {
    const src = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
    expect(src).toContain("import { attachPostToContainer } from '@/components/collabboard/canvas/hooks/attachPostToContainer';");
    expect(src).toContain('await attachPostToContainer({');
  });
});
