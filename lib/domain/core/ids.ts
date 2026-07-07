/**
 * Branded entity ids - prevents cross-entity id mixups at compile time.
 * Casts (`asBoardId`) belong at system boundaries (route params, DB rows),
 * not sprinkled through business logic.
 */
declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type BoardId = Brand<string, 'BoardId'>;
export type PostId = Brand<string, 'PostId'>;
export type UserId = Brand<string, 'UserId'>;

export const asBoardId = (id: string): BoardId => id as BoardId;
export const asPostId = (id: string): PostId => id as PostId;
export const asUserId = (id: string): UserId => id as UserId;
