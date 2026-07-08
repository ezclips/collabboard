import { describe, expect, it } from 'vitest';
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
