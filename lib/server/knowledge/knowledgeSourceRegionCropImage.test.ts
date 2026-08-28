import { describe, expect, it } from 'vitest';
import { cropDerivativeToWebp } from './knowledgeSourceRegionCropRoute';
import { sourceRegionToDisplayRegion } from '../../domain/knowledge/knowledgePageRegionGeometry';

/**
 * P6J-F9-C1. A real synthetic WebP -- built with the same @napi-rs/canvas
 * encoder A1 uses, at the same q80 -- run through the REAL crop processor. No
 * mocked loadImage/createCanvas/drawImage/encode. Colour, not just dimension,
 * is the oracle: a wrong crop is a wrong quadrant, visibly.
 */

const WIDTH = 400;
const HEIGHT = 300;
const RED = [255, 0, 0]; // top-left
const GREEN = [0, 255, 0]; // top-right
const BLUE = [0, 0, 255]; // bottom-left
const YELLOW = [255, 255, 0]; // bottom-right

async function quadrantDerivative(): Promise<Uint8Array> {
  const { createCanvas } = await import('@napi-rs/canvas');
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = `rgb(${RED.join(',')})`; ctx.fillRect(0, 0, WIDTH / 2, HEIGHT / 2);
  ctx.fillStyle = `rgb(${GREEN.join(',')})`; ctx.fillRect(WIDTH / 2, 0, WIDTH / 2, HEIGHT / 2);
  ctx.fillStyle = `rgb(${BLUE.join(',')})`; ctx.fillRect(0, HEIGHT / 2, WIDTH / 2, HEIGHT / 2);
  ctx.fillStyle = `rgb(${YELLOW.join(',')})`; ctx.fillRect(WIDTH / 2, HEIGHT / 2, WIDTH / 2, HEIGHT / 2);
  return canvas.encode('webp', 80);
}

async function centerPixel(bytes: Uint8Array): Promise<readonly [number, number, number]> {
  const { loadImage, createCanvas } = await import('@napi-rs/canvas');
  const image = await loadImage(Buffer.from(bytes));
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const [r, g, b] = ctx.getImageData(Math.floor(image.width / 2), Math.floor(image.height / 2), 1, 1).data;
  return [r, g, b];
}

/** Lossy WebP shifts channels a little; a solid fill stays close to its source. */
function expectColor(actual: readonly [number, number, number], expected: readonly number[]) {
  actual.forEach((channel, index) => expect(channel, `channel ${index}`).toBeCloseTo(expected[index], -1));
}

describe('P6J-F9-C1 real WebP crop processor', () => {
  it('crops only the requested display quadrant, at the right dimensions', async () => {
    const derivative = await quadrantDerivative();
    // Entirely inside the top-right (green) quadrant: pixel box 240,30 -> 360,120.
    const region = { x: 0.6, y: 0.1, width: 0.3, height: 0.3 };
    const cropped = await cropDerivativeToWebp(derivative, region);

    const { loadImage } = await import('@napi-rs/canvas');
    const image = await loadImage(Buffer.from(cropped));
    expect(image.width).toBe(120);
    expect(image.height).toBe(90);
    expectColor(await centerPixel(cropped), GREEN);
  });

  it('the same crop does not read from the other three quadrants', async () => {
    const derivative = await quadrantDerivative();
    for (const [region, excluded] of [
      [{ x: 0.05, y: 0.05, width: 0.2, height: 0.2 }, [GREEN, BLUE, YELLOW]], // red
      [{ x: 0.05, y: 0.55, width: 0.2, height: 0.2 }, [RED, GREEN, YELLOW]], // blue
      [{ x: 0.55, y: 0.55, width: 0.2, height: 0.2 }, [RED, GREEN, BLUE]], // yellow
    ] as const) {
      const pixel = await centerPixel(await cropDerivativeToWebp(derivative, region));
      for (const other of excluded) {
        const distance = Math.abs(pixel[0] - other[0]) + Math.abs(pixel[1] - other[1]) + Math.abs(pixel[2] - other[2]);
        expect(distance, `must not read as [${other}]`).toBeGreaterThan(60);
      }
    }
  });

  it('rejects a decode failure rather than fabricating a crop', async () => {
    await expect(cropDerivativeToWebp(new Uint8Array([1, 2, 3]), { x: 0, y: 0, width: 1, height: 1 }))
      .rejects.toThrow();
  });

  it('rejects an out-of-bounds crop box rather than calling into the decoder with it', async () => {
    const derivative = await quadrantDerivative();
    await expect(cropDerivativeToWebp(derivative, { x: 0, y: 0, width: 0, height: 0 })).rejects.toThrow();
  });

  it('90-degree rotation: the SOURCE region must be transformed before cropping, not cropped as-is', async () => {
    const derivative = await quadrantDerivative();
    // Persisted SOURCE region near the page's own top-left; the worker already
    // baked a 90-degree rotation into this raster.
    const sourceRegion = { x: 0.1, y: 0.1, width: 0.3, height: 0.3 };
    const display = sourceRegionToDisplayRegion(sourceRegion, 90)!;
    // Hand-computed: 1 - 0.1 - 0.3 = 0.6, lands the crop in the green quadrant.
    for (const [key, value] of Object.entries({ x: 0.6, y: 0.1, width: 0.3, height: 0.3 })) {
      expect(display[key as keyof typeof display], key).toBeCloseTo(value, 9);
    }

    const correct = await cropDerivativeToWebp(derivative, display);
    expectColor(await centerPixel(correct), GREEN);

    // The mutation this proves: cropping the untransformed SOURCE region
    // directly reads the WRONG quadrant (red, not green) on this raster.
    const wrong = await cropDerivativeToWebp(derivative, sourceRegion);
    expectColor(await centerPixel(wrong), RED);
  });
});
