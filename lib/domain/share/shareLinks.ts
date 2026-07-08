import type { DomainError } from '../core/errors';
import type { Result } from '../core/result';

/** Mirrors the columns app/share/[token] consumes today. Loose by design. */
export interface ShareLink {
  readonly id: string | number;
  readonly token: string;
  readonly share_target: string | null;
  readonly board_id: string | null;
  readonly padlet_id: string | null;
  readonly permission: string | null;
  readonly password_hash: string | null;
  readonly expires_at: string | null;
  readonly access_count: number | null;
}

export interface ShareLinkRepository {
  /** null = token not found (not an error). */
  findByToken(token: string): Promise<Result<ShareLink | null, DomainError>>;
  /**
   * Fire-and-forget access bookkeeping — callers do NOT await it and its
   * failure must never affect the page (mirrors today's `.then(() => {})`).
   */
  recordAccess(linkId: ShareLink['id'], currentCount: number): Promise<void>;
}
