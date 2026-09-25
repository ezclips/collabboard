import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PATCH-182 -- the wiring, at the source level.
 *
 * The privacy rule is absolute: a picture cut from a Knowledge PDF must never
 * reach `padlet-files` or any public bucket. This pins that the two CanvasClient
 * save arms hand their data URL to the one storage helper, that the editor
 * layers know nothing about it, and that the helper's PDF-area branch returns
 * before the public gateway is ever reached.
 */

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

/** Line and block comments removed, so a negative check tests code, not prose. */
function codeOf(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function between(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  expect(start, `could not find "${startMarker}"`).toBeGreaterThan(-1);
  const end = source.indexOf(endMarker, start + startMarker.length);
  expect(end, `could not find "${endMarker}" after "${startMarker}"`).toBeGreaterThan(-1);
  return source.slice(start, end);
}

const canvasClient = read('app/dashboard/canvas/[id]/CanvasClient.tsx');

describe('both CanvasClient save arms move the picture through the one helper', () => {
  const drawArm = between(canvasClient, '<ImageDrawingLayer', 'onChangeColor');
  const cropArm = between(canvasClient, '<ImageCropLayer', '{/* Card View Lightbox');

  it('the Draw arm stores the drawing variant, then persists the stored URL', () => {
    expect(drawArm).toContain('storeEditedImage');
    expect(drawArm).toContain("variant: 'drawing'");
    expect(drawArm).toContain('imageUrl: drawn.url');
    // A PDF-area post keeps the original data URL for the durable Library row,
    // decided by the helper's own `stored` verdict -- not a second provenance
    // parser in CanvasClient.
    expect(drawArm).toContain('libraryImageUrl');
    expect(drawArm).toContain("drawn.stored === 'private-file'");
  });

  it('the Crop arm stores the base variant, then persists the stored URL', () => {
    expect(cropArm).toContain('storeEditedImage');
    expect(cropArm).toContain("variant: 'base'");
    expect(cropArm).toContain('imageUrl: cropped.url');
  });

  it('the editor layers themselves are untouched: no helper, no public bucket', () => {
    for (const file of [
      'components/collabboard/editors/ImageDrawingLayer.tsx',
      'components/collabboard/editors/ImageCropLayer.tsx',
    ]) {
      const code = codeOf(read(file));
      expect(code, file).not.toContain('storeEditedImage');
      expect(code, file).not.toContain('padlet-files');
      expect(code, file).not.toContain('image-edits/');
    }
  });
});

describe('the storage helper keeps a PDF-area picture off the public gateway', () => {
  const helper = read('lib/infra/collabboard/imageEditStorage.ts');
  const provenanceAt = helper.indexOf('parseKnowledgePdfAreaProvenance(metadata)');
  const privateReturnAt = helper.indexOf("stored: 'private-file'");
  const gatewayAt = helper.indexOf('createStorageGateway()');

  it('checks provenance, then returns from the private branch, before the gateway', () => {
    expect(provenanceAt).toBeGreaterThan(-1);
    expect(privateReturnAt).toBeGreaterThan(provenanceAt);
    expect(gatewayAt).toBeGreaterThan(privateReturnAt);
  });

  it('the private branch never names the public bucket', () => {
    const privateBranch = helper.slice(provenanceAt, privateReturnAt);
    expect(privateBranch).not.toContain('padlet-files');
    expect(privateBranch).toContain('fetch(');
  });
});
