import type { Result } from '../core/result';
import type { DomainError } from '../core/errors';
import type { BoardId, UserId } from '../core/ids';

/**
 * Minimal board read/write contract - the exemplar repository interface.
 * Implementations live in lib/infra (PATCH-004+); the domain never imports
 * them directly, they are injected. Methods are added ONLY when an extraction
 * patch needs them (CONVENTIONS.md rule 7) - do not pre-build CRUD.
 */
export interface BoardSummary {
  readonly id: BoardId;
  readonly title: string;
  readonly activeLayout: string;
  readonly deletedAt: string | null;
}

export interface BoardRepository {
  findById(id: BoardId): Promise<Result<BoardSummary, DomainError>>;
  listForUser(userId: UserId): Promise<Result<readonly BoardSummary[], DomainError>>;
  softDelete(id: BoardId): Promise<Result<void, DomainError>>;
}
