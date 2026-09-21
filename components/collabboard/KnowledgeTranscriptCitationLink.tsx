"use client";

import React from 'react';

import {
  knowledgeTranscriptCitationTarget,
  KNOWLEDGE_TRANSCRIPT_DISCLOSURE,
} from '@/lib/domain/knowledge/knowledgeTranscriptCitation';
import type { KnowledgeTranscriptStoredRepresentation } from '@/lib/domain/knowledge/knowledgeTranscriptVersion';

/**
 * What a transcript source shows beside a cited passage.
 *
 * TWO JOBS, AND THE SECOND IS NOT OPTIONAL:
 *
 *   1. Offer the moment, WHEN there is one to offer.
 *   2. Say that both the transcript and its video association are unverified
 *      claims -- ALWAYS, including when there is no link at all. A reader who
 *      only sees the disclosure next to timestamps would reasonably conclude
 *      the ones without it had been checked.
 *
 * It renders nothing clickable when no cue owns the cited range. That is the
 * case this whole path exists to get right: a nearest-cue guess would produce
 * a link to a moment nobody quoted, and nothing about such a link looks wrong.
 */
export interface KnowledgeTranscriptCitationLinkProps {
  readonly representation: KnowledgeTranscriptStoredRepresentation;
  /** The cited range, in UTF-16 code units of the canonical transcript. */
  readonly charStart: number;
  readonly charEnd: number;
}

/** mm:ss, or h:mm:ss past an hour. Shown so the link says where it goes. */
function formatTimestamp(startMs: number): string {
  const total = Math.floor(startMs / 1000);
  const seconds = String(total % 60).padStart(2, '0');
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
}

export function KnowledgeTranscriptCitationLink({
  representation,
  charStart,
  charEnd,
}: KnowledgeTranscriptCitationLinkProps) {
  const target = knowledgeTranscriptCitationTarget(representation, charStart, charEnd);

  return (
    <span className="inline-flex flex-col gap-0.5 text-xs text-gray-600">
      {target.kind === 'timestamped' ? (
        <a
          href={target.url}
          target="_blank"
          // noreferrer as well as noopener: the destination is a video named by
          // whoever imported the transcript, and it does not need to be told
          // which board the reader came from.
          rel="noopener noreferrer"
          className="font-medium text-blue-700 underline"
        >
          Open at {formatTimestamp(target.startMs)}
        </a>
      ) : null}
      <span>{KNOWLEDGE_TRANSCRIPT_DISCLOSURE}</span>
    </span>
  );
}

export default KnowledgeTranscriptCitationLink;
