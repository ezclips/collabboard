/**
 * Closed error taxonomy. UI maps `code` to user-facing copy; `message` is
 * developer-facing only (CONVENTIONS.md rule 3). Extend the union ONLY via a
 * CTO-approved patch.
 */
export type DomainErrorCode =
  | 'validation' // input failed schema/invariant checks
  | 'not_found' // entity does not exist or is soft-deleted
  | 'permission_denied' // caller lacks the required capability
  | 'conflict' // version/uniqueness conflict; retry may help
  | 'rate_limited' // app- or provider-level throttle
  | 'quota_exceeded' // plan entitlement limit reached
  | 'unavailable' // infrastructure failure (network, DB down)
  | 'unknown'; // unexpected exception; always report to telemetry

export interface DomainError {
  readonly code: DomainErrorCode;
  readonly message: string;
  /** Machine-readable extras (e.g. zod issues). Never user-facing. */
  readonly details?: unknown;
  /** Original thrown value, for logging only. */
  readonly cause?: unknown;
}

export function domainError(
  code: DomainErrorCode,
  message: string,
  extras?: { details?: unknown; cause?: unknown },
): DomainError {
  return { code, message, details: extras?.details, cause: extras?.cause };
}
