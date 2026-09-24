import { describe, expect, it, vi } from 'vitest';
import { MB, tooLargeMessage, UPLOAD_LIMITS } from '@/lib/domain/storage/uploadLimits';
import type { StorageUploadOptions } from './storage';
import { SupabaseStorageGateway } from './storage';

function createFakeClient(response: {
  uploadError?: { message?: string } | null;
  uploadThrows?: boolean;
  publicUrl?: string;
}) {
  return {
    storage: {
      from: (bucket: string) => {
        expect(bucket).toBe('avatars');
        return {
          upload: async (path: string, file: File, options?: StorageUploadOptions) => {
            expect(path).toBe('logos/workspace_logo_user-1_123.png');
            expect(file.name).toBe('logo.png');
            expect(options).toEqual({ upsert: true });
            if (response.uploadThrows) {
              throw new Error('Upload threw');
            }
            return { error: response.uploadError ?? null };
          },
          getPublicUrl: (path: string) => {
            expect(path).toBe('logos/workspace_logo_user-1_123.png');
            return { data: { publicUrl: response.publicUrl ?? 'https://example.com/logo.png' } };
          },
        };
      },
    },
  };
}

describe('SupabaseStorageGateway', () => {
  it('passes bucket, path, file, and options through upload', async () => {
    const gateway = new SupabaseStorageGateway(createFakeClient({}));
    const file = new File(['logo'], 'logo.png', { type: 'image/png' });

    const result = await gateway.upload(
      'avatars',
      'logos/workspace_logo_user-1_123.png',
      file,
      { upsert: true },
    );

    expect(result.ok).toBe(true);
  });

  it('maps upload errors to err', async () => {
    const gateway = new SupabaseStorageGateway(
      createFakeClient({ uploadError: { message: 'Upload failed' } }),
    );
    const file = new File(['logo'], 'logo.png', { type: 'image/png' });

    const result = await gateway.upload(
      'avatars',
      'logos/workspace_logo_user-1_123.png',
      file,
      { upsert: true },
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('unavailable');
  });

  it('maps thrown upload failures to err', async () => {
    const gateway = new SupabaseStorageGateway(createFakeClient({ uploadThrows: true }));
    const file = new File(['logo'], 'logo.png', { type: 'image/png' });

    const result = await gateway.upload(
      'avatars',
      'logos/workspace_logo_user-1_123.png',
      file,
      { upsert: true },
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('unavailable');
  });

  it('returns the publicUrl from getPublicUrl', () => {
    const gateway = new SupabaseStorageGateway(
      createFakeClient({ publicUrl: 'https://example.com/custom-logo.png' }),
    );

    const publicUrl = gateway.getPublicUrl('avatars', 'logos/workspace_logo_user-1_123.png');

    expect(publicUrl).toBe('https://example.com/custom-logo.png');
  });
});

describe('PATCH-180: the browser upload size gate', () => {
  /** A permissive fake that records whether Supabase was reached. */
  function permissiveClient() {
    const upload = vi.fn(async () => ({ error: null }));
    const api = {
      storage: {
        from: (_bucket: string) => ({
          upload,
          getPublicUrl: (path: string) => ({ data: { publicUrl: `https://example.com/${path}` } }),
        }),
      },
    };
    return { client: api as unknown as ConstructorParameters<typeof SupabaseStorageGateway>[0], upload };
  }

  /** Only `type` and `size` are read on the oversized path; no bytes are needed. */
  const sizedFile = (type: string, size: number) => ({ type, size } as unknown as File);

  it('an oversized image for padlet-files is a validation error and never reaches Supabase', async () => {
    const { client, upload } = permissiveClient();
    const gateway = new SupabaseStorageGateway(client);

    const result = await gateway.upload('padlet-files', 'image-posts/x.png', sizedFile('image/png', 21 * MB));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('validation');
    expect(!result.ok && result.error.message)
      .toBe(tooLargeMessage(21 * MB, UPLOAD_LIMITS.image, 'images'));
    expect(upload).not.toHaveBeenCalled();
  });

  it('an oversized non-image for padlet-files is measured against the FILE limit', async () => {
    const { client, upload } = permissiveClient();
    const gateway = new SupabaseStorageGateway(client);

    const result = await gateway.upload('padlet-files', 'files/x.zip', sizedFile('application/zip', 51 * MB));

    expect(!result.ok && result.error.code).toBe('validation');
    expect(!result.ok && result.error.message)
      .toBe(tooLargeMessage(51 * MB, UPLOAD_LIMITS.file, 'files'));
    expect(upload).not.toHaveBeenCalled();
  });

  it('an image and a non-image are each measured against their OWN limit', async () => {
    const { client, upload } = permissiveClient();
    const gateway = new SupabaseStorageGateway(client);

    // 21 MB: over the image limit, UNDER the file limit.
    expect((await gateway.upload('padlet-files', 'a.png', sizedFile('image/png', 21 * MB))).ok).toBe(false);
    expect((await gateway.upload('padlet-files', 'a.zip', sizedFile('application/zip', 21 * MB))).ok).toBe(true);
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('an oversized avatar is refused against the avatar limit', async () => {
    const { client, upload } = permissiveClient();
    const gateway = new SupabaseStorageGateway(client);

    const result = await gateway.upload('avatars', 'logos/x.png', sizedFile('image/png', 6 * MB));

    expect(!result.ok && result.error.code).toBe('validation');
    expect(!result.ok && result.error.message)
      .toBe(tooLargeMessage(6 * MB, UPLOAD_LIMITS.avatar, 'profile pictures'));
    expect(upload).not.toHaveBeenCalled();
  });

  it('an unknown bucket is NOT checked -- behaviour is unchanged', async () => {
    const { client, upload } = permissiveClient();
    const gateway = new SupabaseStorageGateway(client);

    const result = await gateway.upload('some-other-bucket', 'x.bin', sizedFile('application/octet-stream', 500 * MB));

    expect(result.ok).toBe(true);
    expect(upload).toHaveBeenCalledOnce();
  });
});
