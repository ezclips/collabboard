import { domainError } from '../../domain/core/errors';
import type { DomainError } from '../../domain/core/errors';
import type { Result } from '../../domain/core/result';
import { err, ok } from '../../domain/core/result';
import { createBrowserSupabaseClient } from './browserClient';

export interface StorageUploadOptions {
  readonly upsert?: boolean;
  readonly cacheControl?: string;
}

interface StorageErrorLike {
  readonly message?: string;
}

interface StorageSupabaseClient {
  storage: {
    from(bucket: string): {
      upload(
        path: string,
        file: File,
        options?: StorageUploadOptions,
      ): Promise<{ error: StorageErrorLike | null }>;
      getPublicUrl(path: string): { data: { publicUrl: string } };
    };
  };
}

/**
 * Pattern H - the browser storage seam (PATCH-017; catalog entry lands at
 * review). Thin, bucket-parameterized, behavior-preserving: upload maps
 * errors to Result, getPublicUrl is synchronous and cannot fail upstream.
 */
export interface StorageGateway {
  upload(
    bucket: string,
    path: string,
    file: File,
    options?: StorageUploadOptions,
  ): Promise<Result<void, DomainError>>;
  getPublicUrl(bucket: string, path: string): string;
}

export class SupabaseStorageGateway implements StorageGateway {
  constructor(private readonly client: StorageSupabaseClient) {}

  async upload(
    bucket: string,
    path: string,
    file: File,
    options?: StorageUploadOptions,
  ): Promise<Result<void, DomainError>> {
    try {
      const { error } = await this.client.storage.from(bucket).upload(path, file, options);
      if (error) {
        return err(domainError('unavailable', 'Could not upload file', { cause: error }));
      }
      return ok(undefined);
    } catch (cause: unknown) {
      return err(domainError('unavailable', 'Could not upload file', { cause }));
    }
  }

  getPublicUrl(bucket: string, path: string): string {
    return this.client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }
}

export function createStorageGateway(): StorageGateway {
  return new SupabaseStorageGateway(
    createBrowserSupabaseClient() as unknown as StorageSupabaseClient,
  );
}
