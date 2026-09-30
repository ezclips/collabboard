import { afterEach, describe, expect, it, vi } from 'vitest';

import { downloadImportedDocument, ImportAuthError } from './clientApi';

vi.mock('./clientAuth', () => ({
  resolveClientAccessToken: vi.fn(async () => 'supabase-token'),
}));

afterEach(() => vi.unstubAllGlobals());

describe('downloadImportedDocument', () => {
  it('builds a File with the decoded name and the response content type', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'X-Import-Filename': encodeURIComponent('My Report.pdf'),
        },
      })
    ));

    const file = await downloadImportedDocument('google-drive', 'FILEID1234567890');
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('My Report.pdf');
    expect(file.type).toBe('application/pdf');
    expect(file.size).toBe(3);
  });

  it('forwards the bearer token in the Authorization header', async () => {
    const spy = vi.fn(async (_input: unknown, _init?: RequestInit) => new Response(new Uint8Array([1]), { status: 200 }));
    vi.stubGlobal('fetch', spy);

    await downloadImportedDocument('google-drive', 'FILEID1234567890');

    const init = spy.mock.calls[0][1] as { headers: Record<string, string> };
    expect(init.headers.Authorization).toBe('Bearer supabase-token');
  });

  it('a 401 throws ImportAuthError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })));
    await expect(downloadImportedDocument('google-drive', 'FILEID1234567890'))
      .rejects.toBeInstanceOf(ImportAuthError);
  });

  it('a non-OK response throws with the server error, bounded to 200 chars', async () => {
    const long = 'x'.repeat(500);
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ error: long }), { status: 415 })
    ));
    await expect(downloadImportedDocument('google-drive', 'FILEID1234567890'))
      .rejects.toThrow(/x{200}$/);
  });
});
