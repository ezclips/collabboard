import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { jsPDF } from 'jspdf';
import { extractPdfPageGeometry } from './pdfGeometry';

describe('PDF.js geometry enrichment', () => {
  it('uses canonical source dimensions and preserves 0/90/180/270 rotation separately', async () => {
    const rotations = [0, 90, 180, 270] as const;
    const calls: Array<{ rotation: number; dontFlip?: boolean }> = [];
    const geometry = await extractPdfPageGeometry(new Uint8Array([1]), async () => ({
      numPages: rotations.length,
      async getPage(pageNumber: number) {
        return {
          rotate: rotations[pageNumber - 1],
          getViewport(options: { scale: number; rotation: number; dontFlip?: boolean }) {
            calls.push({ rotation: options.rotation, dontFlip: options.dontFlip });
            return { width: 612, height: 792 };
          },
        };
      },
      async destroy() {},
    }));

    expect(geometry).toEqual([
      { pageNumber: 1, widthPoints: 612, heightPoints: 792, rotation: 0 },
      { pageNumber: 2, widthPoints: 612, heightPoints: 792, rotation: 90 },
      { pageNumber: 3, widthPoints: 612, heightPoints: 792, rotation: 180 },
      { pageNumber: 4, widthPoints: 612, heightPoints: 792, rotation: 270 },
    ]);
    expect(calls).toEqual([
      { rotation: 0, dontFlip: true },
      { rotation: 0, dontFlip: true },
      { rotation: 0, dontFlip: true },
      { rotation: 0, dontFlip: true },
    ]);
  });

  it('reads real PDF.js dimensions from a real PDF without an A4 default', async () => {
    const document = new jsPDF({ unit: 'pt', format: [300, 400] });
    document.text('geometry', 20, 30);
    const bytes = new Uint8Array(document.output('arraybuffer'));
    const geometry = await extractPdfPageGeometry(bytes);

    expect(geometry).toEqual([
      { pageNumber: 1, widthPoints: 300, heightPoints: 400, rotation: 0 },
    ]);
  });

  it('leaves the caller-supplied bytes intact -- PDF.js must not consume them', async () => {
    // PDF.js takes ownership of the `data` it is given and detaches that
    // ArrayBuffer. The worker reads the PDF once and needs the same bytes
    // afterwards to write the parser's input file, so consuming them here
    // makes every real document fail before the parser ever runs. This must
    // exercise the REAL loader: an injected fake never detaches anything.
    const document = new jsPDF({ unit: 'pt', format: [300, 400] });
    document.text('geometry', 20, 30);
    const bytes = new Uint8Array(document.output('arraybuffer'));
    const expectedLength = bytes.byteLength;
    const firstByte = bytes[0];

    await extractPdfPageGeometry(bytes);

    expect(bytes.byteLength).toBe(expectedLength);
    expect(bytes.buffer.detached).toBe(false);
    expect(bytes[0]).toBe(firstByte);
    // The definitive check: the bytes are still writable to disk.
    await expect(fs.writeFile(path.join(os.tmpdir(), 'collabboard-geometry-probe.pdf'), bytes))
      .resolves.toBeUndefined();
    await fs.rm(path.join(os.tmpdir(), 'collabboard-geometry-probe.pdf'), { force: true });
  });
});
