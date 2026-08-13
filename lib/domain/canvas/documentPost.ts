import type { Padlet } from '@/types/collabboard';

// PATCH-149B1a: Document = non-clipart card; no new padlet type (PATCH-149 §14.3/§19.3).
export function isDocumentPost(post: Pick<Padlet, 'type' | 'metadata'>): boolean {
  return post.type === 'card' && !post.metadata?.svgUrl;
}

export interface CardChrome {
  backgroundColor: string;
  topStripColor: string | null;
}

// PATCH 9D: a Container-child wrapper (RowColumnContainerCard, PostCardContent's
// nested-Container branch) needs to know which pair of metadata fields owns a
// child's background/top-stripe color. Every other post type uses the generic
// per-post fields (metadata.cardColor / metadata.topStrip); a Document instead
// owns its color identity through the SAME fields CardPreview already reads at
// root (metadata.backgroundColor / metadata.topStripColor, set by
// ClipartCardDraftModal's color pickers) -- reading the generic fields for a
// Document silently discards a color the user actually chose. Defaults mirror
// CardPreview's own root defaults exactly, so a freshly-created, never
// recolored Document looks identical before and after being grouped into a
// Container.
export function resolveChildCardChrome(child: Pick<Padlet, 'type' | 'metadata'>): CardChrome {
  if (isDocumentPost(child)) {
    const rawTopStrip = (child.metadata as any)?.topStripColor;
    const topStripColor = typeof rawTopStrip === 'string' && rawTopStrip ? rawTopStrip : '#4f46e5';
    return {
      backgroundColor: (child.metadata as any)?.backgroundColor || '#ffffff',
      topStripColor: topStripColor === 'transparent' ? null : topStripColor,
    };
  }
  const genericTopStrip = (child.metadata as any)?.topStrip;
  return {
    backgroundColor: (child.metadata as any)?.cardColor || '#ffffff',
    topStripColor: typeof genericTopStrip === 'string' && genericTopStrip && genericTopStrip !== 'transparent'
      ? genericTopStrip
      : null,
  };
}
