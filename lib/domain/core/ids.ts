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
export type KnowledgeDocumentId = Brand<string, 'KnowledgeDocumentId'>;
export type KnowledgePageId = Brand<string, 'KnowledgePageId'>;
export type KnowledgeChunkId = Brand<string, 'KnowledgeChunkId'>;
export type SourceReferenceId = Brand<string, 'SourceReferenceId'>;

export const asBoardId = (id: string): BoardId => id as BoardId;
export const asPostId = (id: string): PostId => id as PostId;
export const asUserId = (id: string): UserId => id as UserId;
export const asKnowledgeDocumentId = (id: string): KnowledgeDocumentId => id as KnowledgeDocumentId;
export const asKnowledgePageId = (id: string): KnowledgePageId => id as KnowledgePageId;
export const asKnowledgeChunkId = (id: string): KnowledgeChunkId => id as KnowledgeChunkId;
export const asSourceReferenceId = (id: string): SourceReferenceId => id as SourceReferenceId;
