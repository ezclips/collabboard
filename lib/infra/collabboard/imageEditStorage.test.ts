import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { storeEditedImage } from './imageEditStorage';

/**
 * PATCH-182 -- moving an edited Image picture out of the post.
 *
 * The privacy rule is absolute and is the first thing these pin: a picture cut
 * from a Knowledge PDF goes to the private board route and NEVER near the
 * public storage gateway. A failure of any kind keeps the original data URL, so
 * no drawing is ever lost.
 */

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
}));

vi.mock('../supabase/storage', () => ({
  createStorageGateway: () => ({ upload: mocks.upload, getPublicUrl: mocks.getPublicUrl }),
}));

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const DATA_URL = `data:image/png;base64,${Buffer.from(PNG_BYTES).toString('base64')}`;

const pdfAreaMetadata = () => ({
  imageUrl: '/api/boards/b/padlets/p/image',
  source: {
    kind: 'knowledge-pdf-area',
    knowledgeDocumentId: '55555555-5555-4555-8555-555555555555',
    pageNumber: 1,
    region: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
  },
});

const base = {
  boardId: '11111111-1111-4111-8111-111111111111',
  padletId: '44444444-4444-4444-8444-444444444444',
  variant: 'drawing' as const,
  dataUrl: DATA_URL,
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  mocks.upload.mockResolvedValue({ ok: true, value: undefined });
  mocks.getPublicUrl.mockReturnValue('https://cdn.example/public.png');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('a PDF-area post', () => {
  it('PUTs to the private route and NEVER calls the storage gateway', async () => {
    fetchMock.mockResolvedValue(new Response(
      JSON.stringify({ url: '/api/boards/b/padlets/p/image?variant=drawing&v=123' }),
      { status: 200 },
    ));

    const result = await storeEditedImage({ ...base, metadata: pdfAreaMetadata() });

    expect(result).toEqual({
      url: '/api/boards/b/padlets/p/image?variant=drawing&v=123',
      stored: 'private-file',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/boards/${base.boardId}/padlets/${base.padletId}/image?variant=drawing`);
    expect(init.method).toBe('PUT');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('image/png');
    expect(new Uint8Array(init.body as Uint8Array)).toEqual(PNG_BYTES);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.getPublicUrl).not.toHaveBeenCalled();
  });

  it('uses the variant it was given', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ url: '/x?variant=base&v=1' }), { status: 200 }));
    await storeEditedImage({ ...base, variant: 'base', metadata: pdfAreaMetadata() });
    expect(fetchMock.mock.calls[0][0]).toContain('variant=base');
  });

  it('a failed PUT keeps the original data URL and never throws', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 500 }));
    const result = await storeEditedImage({ ...base, metadata: pdfAreaMetadata() });
    expect(result).toEqual({ url: DATA_URL, stored: 'inline' });
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('a thrown PUT keeps the original data URL and never throws', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    const result = await storeEditedImage({ ...base, metadata: pdfAreaMetadata() });
    expect(result).toEqual({ url: DATA_URL, stored: 'inline' });
  });

  it('a PUT that returns no url keeps the original data URL', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    const result = await storeEditedImage({ ...base, metadata: pdfAreaMetadata() });
    expect(result).toEqual({ url: DATA_URL, stored: 'inline' });
  });
});

describe('an ordinary post', () => {
  it('uploads to padlet-files under image-edits/{board}/{padlet}/ and returns the public URL', async () => {
    mocks.getPublicUrl.mockReturnValue('https://cdn.example/object/public/image-edits.png');

    const result = await storeEditedImage({ ...base, metadata: { imageUrl: 'https://cdn.example/a.png' } });

    expect(result).toEqual({
      url: 'https://cdn.example/object/public/image-edits.png',
      stored: 'public-file',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    const [bucket, objectPath, file] = mocks.upload.mock.calls[0] as [string, string, File];
    expect(bucket).toBe('padlet-files');
    expect(objectPath).toMatch(
      new RegExp(`^image-edits/${base.boardId}/${base.padletId}/drawing-\\d+\\.png$`),
    );
    expect(file.type).toBe('image/png');
    expect(mocks.getPublicUrl).toHaveBeenCalledWith('padlet-files', objectPath);
  });

  it('a failed upload keeps the original data URL and never throws', async () => {
    mocks.upload.mockResolvedValue({ ok: false, error: { message: 'storage down' } });
    const result = await storeEditedImage({ ...base, metadata: {} });
    expect(result).toEqual({ url: DATA_URL, stored: 'inline' });
  });

  it('a thrown upload keeps the original data URL and never throws', async () => {
    mocks.upload.mockRejectedValue(new Error('storage down'));
    const result = await storeEditedImage({ ...base, metadata: {} });
    expect(result).toEqual({ url: DATA_URL, stored: 'inline' });
  });
});

describe('nothing to move', () => {
  it('a non-data URL is returned as is', async () => {
    const result = await storeEditedImage({ ...base, metadata: {}, dataUrl: 'https://cdn.example/photo.png' });
    expect(result).toEqual({ url: 'https://cdn.example/photo.png', stored: 'inline' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('a data URL of a type the editors do not produce is returned as is', async () => {
    const svg = 'data:image/svg+xml;base64,PHN2Zy8+';
    const result = await storeEditedImage({ ...base, metadata: {}, dataUrl: svg });
    expect(result).toEqual({ url: svg, stored: 'inline' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('an empty or malformed data URL is returned as is', async () => {
    for (const dataUrl of ['', 'data:image/png;base64,', 'data:image/png;base64,!!!']) {
      const result = await storeEditedImage({ ...base, metadata: {}, dataUrl });
      expect(result).toEqual({ url: dataUrl, stored: 'inline' });
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});
