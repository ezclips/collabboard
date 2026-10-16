// PATCH-380. The viewer-upload seam: the SAME helper serves a member (direct to
// `padlet-files`) and a guest (the server route), and the only thing that
// chooses between them is `isGuest`.
import { afterEach, describe, expect, it, vi } from 'vitest';

const upload = vi.fn();
const getPublicUrl = vi.fn();
vi.mock('../supabase/storage', () => ({
  createStorageGateway: () => ({ upload, getPublicUrl }),
}));

import { uploadFileForViewer } from './viewerUpload';

const BOARD = 'f1000000-0000-4000-8000-0000000000b1';
const FILE = new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' });

afterEach(() => {
  vi.restoreAllMocks();
  upload.mockReset();
  getPublicUrl.mockReset();
});

describe('uploadFileForViewer', () => {
  it('a member uploads directly to padlet-files and never touches the guest route', async () => {
    upload.mockResolvedValue({ ok: true });
    getPublicUrl.mockReturnValue('https://cdn.test/x.png');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const url = await uploadFileForViewer({
      isGuest: false, boardId: BOARD, file: FILE, storagePath: 'image-posts/x.png',
    });

    expect(url).toBe('https://cdn.test/x.png');
    expect(upload).toHaveBeenCalledWith('padlet-files', 'image-posts/x.png', FILE);
    expect(getPublicUrl).toHaveBeenCalledWith('padlet-files', 'image-posts/x.png');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('a member upload that fails THROWS', async () => {
    upload.mockResolvedValue({ ok: false, error: { message: 'nope', cause: new Error('cause') } });

    await expect(uploadFileForViewer({
      isGuest: false, boardId: BOARD, file: FILE, storagePath: 'image-posts/x.png',
    })).rejects.toThrow('cause');
  });

  it('a guest POSTs a FormData body to /api/boards/<id>/guest-upload and never touches Storage', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      { ok: true, json: async () => ({ url: 'https://cdn.test/guest.png' }) } as unknown as Response,
    );

    const url = await uploadFileForViewer({
      isGuest: true, boardId: BOARD, file: FILE, storagePath: 'ignored/path.png',
    });

    expect(url).toBe('https://cdn.test/guest.png');
    expect(upload).not.toHaveBeenCalled();
    expect(getPublicUrl).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [requested, init] = fetchSpy.mock.calls[0];
    expect(requested).toBe(`/api/boards/${BOARD}/guest-upload`);
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init!.body as FormData).get('file')).toBe(FILE);
  });

  it('a guest route refusal THROWS the server message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      {
        ok: false,
        json: async () => ({ error: 'Create a free account to upload files.', code: 'guest_no_upload' }),
      } as unknown as Response,
    );

    await expect(uploadFileForViewer({
      isGuest: true, boardId: BOARD, file: FILE, storagePath: 'ignored/path.png',
    })).rejects.toThrow('Create a free account to upload files.');
  });
});
