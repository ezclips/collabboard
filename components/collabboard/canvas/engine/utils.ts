/**
 * Pure utility helpers for the canvas.
 * No React, no state, no Supabase, no DOM.
 */

import type { Padlet } from '@/types/collabboard';

export const isStripVisible = (color?: string): boolean => {
  return !!color && color !== 'transparent';
};

export function debounce<T extends (...args: any[]) => void>(fn: T, ms: number) {
  let t: any;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function sanitizeLibraryMetadata(meta?: Record<string, any>) {
  if (!meta) return {};
  const next = { ...meta };
  delete next.parentId;
  delete next.childPadletIds;
  delete next.sectionId;
  delete next.sectionPosition;
  delete next.position_in_timeline;
  delete next.wallPosition;
  return next;
}

export function isContainerPadlet(p: Padlet): boolean {
  const meta = p.metadata as any;
  return p.type === 'container' || meta?.kind === 'container' || meta?.isContainer === true;
}

export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

export function htmlToText(html: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}
