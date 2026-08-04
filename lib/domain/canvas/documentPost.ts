import type { Padlet } from '@/types/collabboard';

// PATCH-149B1a: Document = non-clipart card; no new padlet type (PATCH-149 §14.3/§19.3).
export function isDocumentPost(post: Pick<Padlet, 'type' | 'metadata'>): boolean {
  return post.type === 'card' && !post.metadata?.svgUrl;
}
